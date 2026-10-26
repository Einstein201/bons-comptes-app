import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletsService } from './wallets.service.js';

describe('WalletsService', () => {
  let walletsService: WalletsService;
  let prisma: {
    $transaction: Mock;
  };
  let transaction: {
    wallet: { create: Mock };
    walletMember: { create: Mock };
  };

  beforeEach(() => {
    transaction = {
      wallet: { create: vi.fn() },
      walletMember: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    walletsService = new WalletsService(prisma as unknown as PrismaService);
  });

  it('creates an open wallet and adds its creator as the first member atomically', async () => {
    const createdWallet = {
      id: 'wallet-123',
      title: 'Vacances à Montréal',
      description: 'Dépenses du voyage',
      status: 'OPEN',
      createdAt: new Date(),
    };
    transaction.wallet.create.mockResolvedValue(createdWallet);
    transaction.walletMember.create.mockResolvedValue({ id: 'member-123' });

    await expect(
      walletsService.create(
        {
          title: createdWallet.title,
          description: createdWallet.description,
        },
        'user-123',
      ),
    ).resolves.toEqual(createdWallet);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.wallet.create).toHaveBeenCalledWith({
      data: {
        title: createdWallet.title,
        description: createdWallet.description,
        status: 'OPEN',
        createdById: 'user-123',
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });
    expect(transaction.walletMember.create).toHaveBeenCalledWith({
      data: {
        walletId: createdWallet.id,
        userId: 'user-123',
        status: 'MEMBER',
        acceptedAt: expect.any(Date),
      },
    });
  });

  it('rolls back when adding the first member fails', async () => {
    const transactionError = new Error('member creation failed');
    transaction.wallet.create.mockResolvedValue({ id: 'wallet-123' });
    transaction.walletMember.create.mockRejectedValue(transactionError);

    await expect(
      walletsService.create({ title: 'Wallet' }, 'user-123'),
    ).rejects.toBe(transactionError);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe('WalletsService.findOne', () => {
  let walletsService: WalletsService;
  let prisma: {
    wallet: { findUnique: Mock };
    walletMember: { findUnique: Mock; findMany: Mock };
  };

  const wallet = {
    id: 'wallet-123',
    title: 'Vacances à Montréal',
    description: 'Dépenses du voyage',
    status: 'OPEN',
    createdAt: new Date('2026-10-25T12:00:00.000Z'),
  };

  function createMembership(id: string, userId: string, status: string) {
    return {
      id,
      status,
      invitedAt: new Date('2026-10-25T12:00:00.000Z'),
      acceptedAt:
        status === 'MEMBER' ? new Date('2026-10-25T12:05:00.000Z') : null,
      user: {
        id: userId,
        name: `Nom ${userId}`,
        email: `${userId}@example.com`,
      },
    };
  }

  beforeEach(() => {
    prisma = {
      wallet: { findUnique: vi.fn() },
      walletMember: { findUnique: vi.fn(), findMany: vi.fn() },
    };
    walletsService = new WalletsService(prisma as unknown as PrismaService);
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(
      walletsService.findOne('unknown', 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.walletMember.findMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is not a member', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue(null);

    await expect(
      walletsService.findOne(wallet.id, 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.walletMember.findMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is only invited', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'INVITED' });

    await expect(
      walletsService.findOne(wallet.id, 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.walletMember.findMany).not.toHaveBeenCalled();
  });

  it('returns the wallet and the members with their status', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([
      createMembership('m-1', 'user-1', 'MEMBER'),
      createMembership('m-2', 'user-2', 'INVITED'),
    ]);

    const result = await walletsService.findOne(wallet.id, 'user-1', {
      limit: 20,
    });

    expect(result).toEqual({
      wallet,
      members: {
        items: [
          {
            userId: 'user-1',
            name: 'Nom user-1',
            email: 'user-1@example.com',
            status: 'MEMBER',
            invitedAt: new Date('2026-10-25T12:00:00.000Z'),
            acceptedAt: new Date('2026-10-25T12:05:00.000Z'),
          },
          {
            userId: 'user-2',
            name: 'Nom user-2',
            email: 'user-2@example.com',
            status: 'INVITED',
            invitedAt: new Date('2026-10-25T12:00:00.000Z'),
            acceptedAt: null,
          },
        ],
        nextCursor: null,
      },
    });
  });

  it('checks the membership of the authenticated user', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([]);

    await walletsService.findOne(wallet.id, 'user-1', { limit: 20 });

    expect(prisma.walletMember.findUnique).toHaveBeenCalledWith({
      where: { walletId_userId: { walletId: wallet.id, userId: 'user-1' } },
      select: { status: true },
    });
  });

  it('fetches one page in a single sorted query', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([]);

    await walletsService.findOne(wallet.id, 'user-1', {
      limit: 20,
      cursor: 'm-5',
    });

    expect(prisma.walletMember.findMany).toHaveBeenCalledOnce();
    expect(prisma.walletMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: wallet.id },
        orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }],
        take: 21,
        cursor: { id: 'm-5' },
        skip: 1,
      }),
    );
  });

  it('returns a nextCursor when there are more members than the limit', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([
      createMembership('m-1', 'user-1', 'MEMBER'),
      createMembership('m-2', 'user-2', 'MEMBER'),
      createMembership('m-3', 'user-3', 'INVITED'),
    ]);

    const result = await walletsService.findOne(wallet.id, 'user-1', {
      limit: 2,
    });

    expect(result.members.items).toHaveLength(2);
    expect(result.members.nextCursor).toBe('m-2');
  });
});