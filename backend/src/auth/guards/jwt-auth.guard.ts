import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../authenticated-request.js';

// Garde provisoire : à supprimer quand le JwtAuthGuard de l'authentification (IF-11) sera fusionné.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user?.userId) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
