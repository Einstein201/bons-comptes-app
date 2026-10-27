import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClosureService } from './closure.service.js';

describe('ClosureService.close', () => {
  let closureService: ClosureService;
  let prisma: { $transaction: Mock };
  let transaction: {
    wallet: { findUnique: Mock; updateMany: Mock; findUniqueOrThrow: Mock };
    walletMember: { deleteMany: Mock };
  };

  const closedWallet = {
    id: 'wallet-1',
    title: 'Vacances',
    description: null,
    status: 'CLOSED',
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-27T10:00:00.000Z'),
    closedAt: new Date('2026-10-27T10:00:00.000Z'),
  };

  beforeEach(() => {
    transaction = {
      wallet: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ createdById: 'creator', status: 'OPEN' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(closedWallet),
      },
      walletMember: { deleteMany: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    closureService = new ClosureService(prisma as unknown as PrismaService);
  });

  it('closes an open wallet and returns it', async () => {
    await expect(closureService.close('wallet-1', 'creator')).resolves.toEqual(
      closedWallet,
    );

    expect(transaction.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'wallet-1', status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: expect.any(Date) },
    });
  });

  it('deletes the pending invitations in the same transaction', async () => {
    await closureService.close('wallet-1', 'creator');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.walletMember.deleteMany).toHaveBeenCalledWith({
      where: { walletId: 'wallet-1', status: 'INVITED' },
    });
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    transaction.wallet.findUnique.mockResolvedValue(null);

    await expect(
      closureService.close('unknown', 'creator'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is not the creator', async () => {
    await expect(
      closureService.close('wallet-1', 'someone-else'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.wallet.updateMany).not.toHaveBeenCalled();
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the wallet is already closed', async () => {
    transaction.wallet.findUnique.mockResolvedValue({
      createdById: 'creator',
      status: 'CLOSED',
    });
    transaction.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      closureService.close('wallet-1', 'creator'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });
});

describe('ClosureService.getBalance', () => {
  let closureService: ClosureService;
  let prisma: {
    wallet: { findUnique: Mock };
    walletMember: { findUnique: Mock; findMany: Mock };
    expense: { aggregate: Mock; groupBy: Mock };
    repayment: { groupBy: Mock };
  };

  beforeEach(() => {
    prisma = {
      wallet: { findUnique: vi.fn().mockResolvedValue({ status: 'CLOSED' }) },
      walletMember: {
        findUnique: vi.fn().mockResolvedValue({ status: 'MEMBER' }),
        findMany: vi.fn().mockResolvedValue([
          { userId: 'user-a', user: { name: 'Alice' } },
          { userId: 'user-b', user: { name: 'Bob' } },
        ]),
      },
      expense: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 10001 } }),
        groupBy: vi
          .fn()
          .mockResolvedValue([{ paidById: 'user-a', _sum: { amount: 10001 } }]),
      },
      repayment: {
        groupBy: vi.fn().mockResolvedValue([
          {
            fromUserId: 'user-b',
            toUserId: 'user-a',
            _sum: { amount: 1000 },
          },
        ]),
      },
    };
    closureService = new ClosureService(prisma as unknown as PrismaService);
  });

  it('builds the balance from the database aggregations', async () => {
    await expect(
      closureService.getBalance('wallet-1', 'user-a'),
    ).resolves.toEqual({
      walletId: 'wallet-1',
      totalAmount: 10001,
      balances: [
        {
          userId: 'user-a',
          name: 'Alice',
          paidAmount: 10001,
          shareAmount: 5001,
          balance: 4000,
        },
        {
          userId: 'user-b',
          name: 'Bob',
          paidAmount: 0,
          shareAmount: 5000,
          balance: -4000,
        },
      ],
      transfers: [{ fromUserId: 'user-b', toUserId: 'user-a', amount: 4000 }],
    });
  });

  it('uses only the accepted members and the paid repayments', async () => {
    await closureService.getBalance('wallet-1', 'user-a');

    expect(prisma.walletMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: 'wallet-1', status: 'MEMBER' },
      }),
    );
    expect(prisma.repayment.groupBy).toHaveBeenCalledWith({
      by: ['fromUserId', 'toUserId'],
      where: { walletId: 'wallet-1', status: 'PAID' },
      _sum: { amount: true },
    });
  });

  it('sums the amounts in the database', async () => {
    await closureService.getBalance('wallet-1', 'user-a');

    expect(prisma.expense.aggregate).toHaveBeenCalledWith({
      where: { walletId: 'wallet-1' },
      _sum: { amount: true },
    });
    expect(prisma.expense.groupBy).toHaveBeenCalledWith({
      by: ['paidById'],
      where: { walletId: 'wallet-1' },
      _sum: { amount: true },
    });
  });

  it('returns a balance at zero for a wallet without expense', async () => {
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.expense.groupBy.mockResolvedValue([]);
    prisma.repayment.groupBy.mockResolvedValue([]);

    const result = await closureService.getBalance('wallet-1', 'user-a');

    expect(result.totalAmount).toBe(0);
    expect(result.balances.map((item) => item.balance)).toEqual([0, 0]);
    expect(result.transfers).toEqual([]);
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(
      closureService.getBalance('unknown', 'user-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException when the user is only invited', async () => {
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'INVITED' });

    await expect(
      closureService.getBalance('wallet-1', 'user-c'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expense.aggregate).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is not a member', async () => {
    prisma.walletMember.findUnique.mockResolvedValue(null);

    await expect(
      closureService.getBalance('wallet-1', 'stranger'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ConflictException when the wallet is still open', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ status: 'OPEN' });

    await expect(
      closureService.getBalance('wallet-1', 'user-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.expense.aggregate).not.toHaveBeenCalled();
  });
});
