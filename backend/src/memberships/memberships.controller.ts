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
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrors,
  ApiJwtAuth,
} from '../common/swagger/api-docs.decorators.js';

@Controller('wallets/:walletId/members')
@ApiTags('members')
@UseGuards(JwtAuthGuard)
@ApiJwtAuth()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  // Déclarée avant ':userId', sinon NestJS prendrait « me » pour un identifiant.
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitter un porte-monnaie' })
  @ApiNoContentResponse({
    description: 'L’utilisateur a quitté le porte-monnaie.',
  })
  @ApiErrors({
    403: 'L’utilisateur n’est pas membre, ou c’est le créateur.',
    404: 'Porte-monnaie introuvable.',
    409: 'Le porte-monnaie est clôturé ou contient des dépenses partagées.',
  })
  leave(
    @Param('walletId') walletId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.membershipsService.leave(walletId, request.user.userId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retirer un membre',
    description: 'Réservé au créateur du porte-monnaie.',
  })
  @ApiNoContentResponse({ description: 'Membre retiré.' })
  @ApiErrors({
    403: 'Seul le créateur peut retirer un membre, et pas lui-même.',
    404: 'Porte-monnaie ou membre introuvable.',
    409: 'Le porte-monnaie est clôturé ou contient des dépenses partagées.',
  })
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
