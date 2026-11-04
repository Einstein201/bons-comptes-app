import {
  Body,
  Controller,
  Delete,
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
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { ListInvitationsQueryDto } from './dto/list-invitations-query.dto.js';
import { InvitationsService } from './invitations.service.js';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';
import {
  AcceptedInvitationResponseDto,
  InvitationPageDto,
  InvitationResponseDto,
} from './dto/invitation-responses.dto.js';

@Controller()
@ApiTags('invitations')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('wallets/:walletId/invitations')
  @ApiOperation({
    summary: 'Inviter une personne',
    description: 'Réservé au créateur. La personne doit déjà avoir un compte.',
  })
  @ApiCreatedResponse({ type: InvitationResponseDto })
  @ApiErrors({
    400: 'Email invalide, ou invitation de soi-même.',
    403: 'Seul le créateur peut inviter un utilisateur.',
    404: 'Porte-monnaie ou utilisateur introuvable.',
    409: 'Le porte-monnaie est clôturé, ou la personne est déjà invitée ou membre.',
  })
  create(
    @Param('walletId') walletId: string,
    @Body() dto: CreateInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invitationsService.create(walletId, dto, request.user.userId);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Lister mes invitations en attente' })
  @ApiOkResponse({ type: InvitationPageDto })
  @ApiErrors({ 400: 'Paramètres ou curseur invalides.' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListInvitationsQueryDto,
  ) {
    return this.invitationsService.list(request.user.userId, query);
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepter une invitation' })
  @ApiOkResponse({ type: AcceptedInvitationResponseDto })
  @ApiErrors({
    403: 'Cette invitation appartient à un autre utilisateur.',
    404: 'Invitation introuvable.',
    409: 'Le porte-monnaie est clôturé, ou l’invitation a déjà été traitée.',
  })
  accept(
    @Param('id') invitationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invitationsService.accept(invitationId, request.user.userId);
  }

  @Post('invitations/:id/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Refuser une invitation' })
  @ApiNoContentResponse({ description: 'Invitation refusée.' })
  @ApiErrors({
    403: 'Cette invitation appartient à un autre utilisateur.',
    404: 'Invitation introuvable.',
    409: 'Le porte-monnaie est clôturé, ou l’invitation a déjà été traitée.',
  })
  async decline(
    @Param('id') invitationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.invitationsService.decline(invitationId, request.user.userId);
  }

  @Delete('wallets/:walletId/invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retirer une invitation',
    description: 'Réservé au créateur du porte-monnaie.',
  })
  @ApiNoContentResponse({ description: 'Invitation retirée.' })
  @ApiErrors({
    403: 'Seul le créateur peut retirer une invitation.',
    404: 'Porte-monnaie ou invitation introuvable.',
    409: 'Le porte-monnaie est clôturé, ou l’invitation a déjà été traitée.',
  })
  async remove(
    @Param('walletId') walletId: string,
    @Param('id') invitationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.invitationsService.remove(
      walletId,
      invitationId,
      request.user.userId,
    );
  }
}
