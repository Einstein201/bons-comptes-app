import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

   const jwtMock = {
  sign: vi.fn()
    .mockReturnValueOnce('fake-access-token')
    .mockReturnValueOnce('fake-refresh-token'),
};

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('refuse une connexion lorsque l’email est inconnu', async () => {
    const dto = {
      email: 'inconnu@example.com',
      password: 'motdepasse',
    };

    const responseMock = {
      cookie: vi.fn(),
    };

    await expect(
      service.login(dto, responseMock),
    ).rejects.toThrow(UnauthorizedException);
  });

    it('refuse une connexion lorsque le mot de passe est incorrect', async () => {
    const dto = {
      email: 'angela@gmail.com',
      password: 'motdepasseincorrect',
    };

    const responseMock = {
      cookie: vi.fn(),
    };

    // Mock the PrismaService to return a user with a hashed password
    const hashedPassword = await bcrypt.hash('motdepassecorrect', 10);
    (service as any).prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: dto.email,
      password: hashedPassword,
    });

    await expect(
      service.login(dto, responseMock),
    ).rejects.toThrow(UnauthorizedException);
  });
  it('accepte une connexion lorsque l’email et le mot de passe sont corrects', async () => {
    const dto = {
      email: 'angela@gmail.com',
      password: 'motdepassecorrect',
    };

    const responseMock = {
      cookie: vi.fn(),
    };

    // Mock the PrismaService to return a user with a hashed password
    const hashedPassword = await bcrypt.hash('motdepassecorrect', 10);
    (service as any).prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: dto.email,
      password: hashedPassword,
    });

   await expect(
  service.login(dto, responseMock),
).resolves.toEqual({
  accessToken: 'fake-access-token',
});
  });
  it('logout should clear the refresh token cookie', async () => {
    const responseMock = {
      clearCookie: vi.fn(),
    };

    const result = await service.logout(responseMock);

    expect(responseMock.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(result).toEqual({ message: 'Logout successful' });
  });

});
