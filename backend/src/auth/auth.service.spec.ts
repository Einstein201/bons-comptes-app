import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REFRESH_COOKIE } from './auth.constants.js';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: { user: { findUnique: ReturnType<typeof vi.fn> } };
  let jwtMock: { sign: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prismaMock = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    jwtMock = {
      sign: vi.fn((payload: { tokenType: string }) =>
        payload.tokenType === 'access' ? 'fake-access-token' : 'fake-refresh-token',
      ),
      verify: vi.fn(),
    };
    const configMock = { getOrThrow: vi.fn().mockReturnValue('refresh-secret') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('refuse une connexion lorsque l’email est inconnu, en exécutant quand même bcrypt', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare');

    await expect(
      service.login({ email: 'inconnu@example.com', password: 'motdepasse' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('refuse une connexion lorsque le mot de passe est incorrect', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'angela@gmail.com',
      password: await bcrypt.hash('motdepassecorrect', 10),
    });

    await expect(
      service.login({ email: 'angela@gmail.com', password: 'incorrect' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('renvoie la même erreur pour email inconnu et mauvais mot de passe', async () => {
    const unknown = await service
      .login({ email: 'x@example.com', password: 'a' })
      .catch((e) => e);
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'angela@gmail.com',
      password: await bcrypt.hash('bon', 10),
    });
    const wrong = await service
      .login({ email: 'angela@gmail.com', password: 'mauvais' })
      .catch((e) => e);

    expect(unknown.message).toBe(wrong.message);
  });

  it('accepte une connexion correcte et renvoie les deux tokens', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'angela@gmail.com',
      password: await bcrypt.hash('motdepassecorrect', 10),
    });

    await expect(
      service.login({ email: 'angela@gmail.com', password: 'motdepassecorrect' }),
    ).resolves.toEqual({
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
    });
  });

  it('refresh : émet de nouveaux tokens pour un refresh token valide', async () => {
    jwtMock.verify.mockReturnValue({ sub: '1', tokenType: 'refresh' });
    prismaMock.user.findUnique.mockResolvedValue({ id: '1' });

    await expect(service.refresh('valid')).resolves.toEqual({
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
    });
  });

  it('refresh : refuse un cookie absent, invalide ou de mauvais type', async () => {
    await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);

    jwtMock.verify.mockImplementation(() => { throw new Error('expired'); });
    await expect(service.refresh('bad')).rejects.toThrow(UnauthorizedException);

    jwtMock.verify.mockReturnValue({ sub: '1', tokenType: 'access' });
    await expect(service.refresh('access-token')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh : refuse si l’utilisateur n’existe plus', async () => {
    jwtMock.verify.mockReturnValue({ sub: '1', tokenType: 'refresh' });
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.refresh('valid')).rejects.toThrow(UnauthorizedException);
  });

  it('logout efface le cookie du refresh token', () => {
    const res = { clearCookie: vi.fn() };

    const result = service.logout(res as any);

    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.objectContaining({ path: '/auth' }));
    expect(result).toEqual({ message: 'Logout successful' });
  });
});