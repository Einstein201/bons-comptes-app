import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { ClosureService } from './closure.service.js';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import {
  BalanceResponseDto,
  ClosedWalletResponseDto,
  OptimizedPaymentsResponseDto,
} from './dto/closure-responses.dto.js';

@Controller('wallets/:id')
@ApiTags('closure')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
export class ClosureController {
  constructor(private readonly closureService: ClosureService) {}

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clôturer un porte-monnaie',
    description:
      'Réservé au créateur. Les invitations en attente sont supprimées.',
  })
  @ApiOkResponse({ type: ClosedWalletResponseDto })
  @ApiErrors({
    403: 'Seul le créateur peut clôturer ce porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
    409: 'Le porte-monnaie est déjà clôturé.',
  })
  close(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.closureService.close(id, request.user.userId);
  }

  @Get('balance')
  @ApiOperation({
    summary: 'Bilan d’un porte-monnaie clôturé',
    description: 'Solde de chaque membre et virements restant à faire.',
  })
  @ApiOkResponse({ type: BalanceResponseDto })
  @ApiErrors({
    403: 'L’utilisateur n’est pas membre du porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
    409: 'Le bilan n’est disponible que pour un porte-monnaie clôturé.',
  })
  getBalance(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.closureService.getBalance(id, request.user.userId);
  }

  @Get('optimized-payments')
  @ApiOperation({
    summary: 'Virements proposés',
    description:
      'Plan de remboursement optimisé, avec le reste à régler et le montant encore déclarable.',
  })
  @ApiOkResponse({ type: OptimizedPaymentsResponseDto })
  @ApiErrors({
    403: 'L’utilisateur n’est pas membre du porte-monnaie.',
    404: 'Porte-monnaie introuvable.',
    409: 'Le bilan n’est disponible que pour un porte-monnaie clôturé.',
  })
  getOptimizedPayments(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.closureService.getOptimizedPayments(id, request.user.userId);
  }
}
