import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/auth.guard.js';
import { MembershipsService } from './memberships.service.js';

@Controller('wallets/:walletId/members')
@UseGuards(JwtAuthGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  // Déclarée avant ':userId', sinon NestJS prendrait « me » pour un identifiant.
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @Param('walletId') walletId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.membershipsService.leave(walletId, request.user.userId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('walletId') walletId: string,
    @Param('userId') memberId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.membershipsService.remove(
      walletId,
      memberId,
      request.user.userId,
    );
  }
}
