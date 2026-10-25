import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
