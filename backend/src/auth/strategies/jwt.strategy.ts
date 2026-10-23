import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

 validate(payload: unknown) {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('sub' in payload) ||
    typeof payload.sub !== 'string' ||
    payload.sub.trim() === '' ||
    !('tokenType' in payload) ||
    payload.tokenType !== 'access'
  ) {
    throw new UnauthorizedException('Jeton invalide');
  }

  return { userId: payload.sub };
}
}