import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  BCRYPT_ROUNDS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_MS,
  refreshCookieBase,
} from './auth.constants.js';

const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect';

@Injectable()
export class AuthService {
  // Calculé une seule fois au démarrage
  private readonly dummyHash = bcrypt.hashSync(
    'mot-de-passe-factice',
    BCRYPT_ROUNDS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const isMatch = await this.verifyPassword(
      dto.password,
      user?.password ?? this.dummyHash,
    );

    if (!user || !isMatch) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueTokens(user.id, user.sessionVersion);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (
      !user ||
      !(await this.verifyPassword(dto.currentPassword, user.password))
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password,
        sessionVersion: { increment: 1 },
      },
    });

    return { message: 'Mot de passe modifié avec succès.' };
  }

  private verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken)
      throw new UnauthorizedException('Refresh token manquant');

    let payload: {
      sub?: unknown;
      tokenType?: unknown;
      sessionVersion?: unknown;
    };
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
    const tokenSessionVersion =
      payload.sessionVersion === undefined ? 0 : payload.sessionVersion;
    if (
      typeof tokenSessionVersion !== 'number' ||
      !Number.isInteger(tokenSessionVersion) ||
      tokenSessionVersion < 0
    ) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user)
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    if (user.sessionVersion !== tokenSessionVersion) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // Nouveau refresh token émis; l'ancien reste valide jusqu'à son expiration (pas de révocation côté serveur)
    return this.issueTokens(user.id, user.sessionVersion);
  }

  setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      ...refreshCookieBase(process.env.NODE_ENV === 'production'),
      maxAge: REFRESH_MAX_AGE_MS,
    });
  }

  logout(res: Response) {
    // Pas de maxAge ici : clearCookie fixe lui-même une expiration passée
    res.clearCookie(
      REFRESH_COOKIE,
      refreshCookieBase(process.env.NODE_ENV === 'production'),
    );
    return { message: 'Logout successful' };
  }

  private issueTokens(userId: string, sessionVersion: number) {
    const accessToken = this.jwtService.sign(
      { sub: userId, tokenType: 'access' },
      { expiresIn: '1h' },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, tokenType: 'refresh', sessionVersion },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );
    return { accessToken, refreshToken };
  }
}
