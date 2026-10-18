import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
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
    const createUserInput = {
      email: 'alice@example.com',
      name: 'Alice',
      password: 'motdepasse123',
    };

    const createdUser = {
      id: 'user-123',
      email: createUserInput.email,
      name: createUserInput.name,
      createdAt: new Date(),
    };

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(createdUser);

    const result = await usersService.create(createUserInput);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: createUserInput.email },
      select: { id: true },
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: createUserInput.email,
        name: createUserInput.name,
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
});
