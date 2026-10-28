import {
  Body,
  Controller,
  Get,
  HttpCode,
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

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('wallets/:walletId/invitations')
  create(
    @Param('walletId') walletId: string,
    @Body() dto: CreateInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invitationsService.create(walletId, dto, request.user.userId);
  }

  @Get('invitations')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListInvitationsQueryDto,
  ) {
    return this.invitationsService.list(request.user.userId, query);
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  accept(
    @Param('id') invitationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invitationsService.accept(invitationId, request.user.userId);
  }
}
