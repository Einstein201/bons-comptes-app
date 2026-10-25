
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import {
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_MS,
  refreshCookieBase,
} from './auth.constants.js';

const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect';
const BCRYPT_ROUNDS = 10; // doit être le même qu'à l'inscription

@Injectable()
export class AuthService {
  // Calculé une seule fois au démarrage
  private readonly dummyHash = bcrypt.hashSync('mot-de-passe-factice', BCRYPT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const isMatch = await this.verifyPassword(dto.password, user?.password ?? this.dummyHash);

    if (!user || !isMatch) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueTokens(user.id);
  }

  private verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token manquant');

    let payload: { sub?: unknown; tokenType?: unknown };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }
    if (
      payload.tokenType !== 'refresh' ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim() === ''
    ) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Refresh token invalide ou expiré');

    // Nouveau refresh token émis; l'ancien reste valide jusqu'à son expiration (pas de révocation côté serveur)
    return this.issueTokens(user.id);
  }

  setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      ...refreshCookieBase(process.env.NODE_ENV === 'production'),
      maxAge: REFRESH_MAX_AGE_MS,
    });
  }

  logout(res: Response) {
    // Pas de maxAge ici : il empêcherait l'effacement sous Express 4
    res.clearCookie(REFRESH_COOKIE, refreshCookieBase(process.env.NODE_ENV === 'production'));
    return { message: 'Logout successful' };
  }

  private issueTokens(userId: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, tokenType: 'access' },
      { expiresIn: '1h' },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, tokenType: 'refresh' },
      { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: '7d' },
    );
    return { accessToken, refreshToken };
  }
}