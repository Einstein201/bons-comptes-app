import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    user: {
      findUnique: Mock;
      create: Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    usersService = new UsersService(prisma as unknown as PrismaService);
  });

  it('creates a user with a hashed password and does not return the password', async () => {
    const input = {
      email: 'alice@example.com',
      name: 'Alice',
      password: 'motdepasse123',
    };
    const createdUser = {
      id: 'user-123',
      email: input.email,
      name: input.name,
      createdAt: new Date(),
    };

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(createdUser);

    const result = await usersService.create(input);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: input.email },
      select: { id: true },
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: input.email,
        name: input.name,
        password: expect.stringMatching(/^\$2[aby]\$10\$/),
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });
    expect(result).toEqual(createdUser);
    expect(result).not.toHaveProperty('password');
  });

  it('rejects an email that already exists with a conflict exception', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      usersService.create({
        email: 'alice@example.com',
        name: 'Alice',
        password: 'motdepasse123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('translates a concurrent email uniqueness conflict into a conflict exception', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['email'] },
        },
      ),
    );

    await expect(
      usersService.create({
        email: 'alice@example.com',
        name: 'Alice',
        password: 'motdepasse123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
