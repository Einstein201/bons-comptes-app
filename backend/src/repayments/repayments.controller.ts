import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { CreateRepaymentDto } from './dto/create-repayment.dto.js';
import { ListRepaymentsQueryDto } from './dto/list-repayments-query.dto.js';
import { RepaymentsService } from './repayments.service.js';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import {
  RepaymentPageDto,
  RepaymentResponseDto,
} from './dto/repayment-responses.dto.js';

@Controller('wallets/:walletId/repayments')
@ApiTags('repayments')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Déclarer un remboursement',
    description:
      'Uniquement sur un porte-monnaie clôturé. Le remboursement reste en attente jusqu’à sa confirmation.',
  })
  @ApiCreatedResponse({ type: RepaymentResponseDto })
  @ApiErrors({
    400: 'Données invalides, remboursement à soi-même, ou destinataire non membre.',
    403: 'L’utilisateur n’est pas membre du porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
    409: 'Le porte-monnaie n’est pas clôturé, ou le montant dépasse la dette restante.',
  })
  declare(
    @Param('walletId') walletId: string,
    @Body() createRepaymentDto: CreateRepaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.declare(
      walletId,
      request.user.userId,
      createRepaymentDto,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les remboursements',
    description:
      'Du plus récent au plus ancien, avec un filtre optionnel par statut.',
  })
  @ApiOkResponse({ type: RepaymentPageDto })
  @ApiErrors({
    400: 'Paramètres ou curseur invalides.',
    403: 'L’utilisateur n’est pas membre du porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
  })
  findAll(
    @Param('walletId') walletId: string,
    @Query() query: ListRepaymentsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.findAll(walletId, request.user.userId, query);
  }

  @Post(':repaymentId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmer un remboursement',
    description: 'Réservé au destinataire ou au créateur du porte-monnaie.',
  })
  @ApiOkResponse({ type: RepaymentResponseDto })
  @ApiErrors({
    403: 'Seul le destinataire ou le créateur peut confirmer ce remboursement.',
    404: 'Remboursement introuvable.',
    409: 'Le porte-monnaie n’est pas clôturé, ou le remboursement a déjà été traité.',
  })
  confirm(
    @Param('walletId') walletId: string,
    @Param('repaymentId') repaymentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.confirm(
      walletId,
      repaymentId,
      request.user.userId,
    );
  }

  @Post(':repaymentId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Annuler un remboursement',
    description: 'Réservé à l’émetteur du remboursement.',
  })
  @ApiOkResponse({ type: RepaymentResponseDto })
  @ApiErrors({
    403: 'Seul l’émetteur peut annuler ce remboursement.',
    404: 'Remboursement introuvable.',
    409: 'Le porte-monnaie n’est pas clôturé, ou le remboursement a déjà été traité.',
  })
  cancel(
    @Param('walletId') walletId: string,
    @Param('repaymentId') repaymentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.repaymentsService.cancel(
      walletId,
      repaymentId,
      request.user.userId,
    );
  }
}
