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

function createPrismaMock() {
  return {
    wallet: { findUnique: vi.fn().mockResolvedValue({ status: 'CLOSED' }) },
    walletMember: {
      findUnique: vi.fn().mockResolvedValue({ status: 'MEMBER' }),
      findMany: vi.fn(),
    },
    expense: { aggregate: vi.fn(), groupBy: vi.fn() },
    repayment: { groupBy: vi.fn() },
  };
}

describe('ClosureService.getBalance', () => {
  let closureService: ClosureService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.walletMember.findMany.mockResolvedValue([
      { userId: 'user-a', user: { name: 'Alice' } },
      { userId: 'user-b', user: { name: 'Bob' } },
    ]);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 10001 } });
    prisma.expense.groupBy.mockResolvedValue([
      { paidById: 'user-a', _sum: { amount: 10001 } },
    ]);
    prisma.repayment.groupBy.mockResolvedValue([
      {
        fromUserId: 'user-b',
        toUserId: 'user-a',
        status: 'PAID',
        _sum: { amount: 1000 },
      },
      {
        fromUserId: 'user-b',
        toUserId: 'user-a',
        status: 'PENDING',
        _sum: { amount: 500 },
      },
    ]);
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

  it('uses only the accepted members and the paid or pending repayments', async () => {
    await closureService.getBalance('wallet-1', 'user-a');

    expect(prisma.walletMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: 'wallet-1', status: 'MEMBER' },
      }),
    );
    expect(prisma.repayment.groupBy).toHaveBeenCalledWith({
      by: ['fromUserId', 'toUserId', 'status'],
      where: { walletId: 'wallet-1', status: { in: ['PAID', 'PENDING'] } },
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

describe('ClosureService.getOptimizedPayments', () => {
  let closureService: ClosureService;
  let prisma: ReturnType<typeof createPrismaMock>;

  // Exemple de la revue : Alice doit 50 € à Charles et 10 € à David,
  // Bob doit 40 € à David. Alice a déjà remboursé 10 € à Charles.
  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.walletMember.findMany.mockResolvedValue([
      { userId: 'alice', user: { name: 'Alice' } },
      { userId: 'bob', user: { name: 'Bob' } },
      { userId: 'charles', user: { name: 'Charles' } },
      { userId: 'david', user: { name: 'David' } },
    ]);
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 24000 } });
    prisma.expense.groupBy.mockResolvedValue([
      { paidById: 'bob', _sum: { amount: 2000 } },
      { paidById: 'charles', _sum: { amount: 11000 } },
      { paidById: 'david', _sum: { amount: 11000 } },
    ]);
    prisma.repayment.groupBy.mockResolvedValue([
      {
        fromUserId: 'alice',
        toUserId: 'charles',
        status: 'PAID',
        _sum: { amount: 1000 },
      },
    ]);
    closureService = new ClosureService(prisma as unknown as PrismaService);
  });

  it('keeps the pairs of the initial plan after a paid repayment', async () => {
    await expect(
      closureService.getOptimizedPayments('wallet-1', 'bob'),
    ).resolves.toEqual({
      walletId: 'wallet-1',
      transfers: [
        {
          fromUserId: 'alice',
          toUserId: 'charles',
          initialAmount: 5000,
          remainingAmount: 4000,
          declarableAmount: 4000,
        },
        {
          fromUserId: 'bob',
          toUserId: 'david',
          initialAmount: 4000,
          remainingAmount: 4000,
          declarableAmount: 4000,
        },
        {
          fromUserId: 'alice',
          toUserId: 'david',
          initialAmount: 1000,
          remainingAmount: 1000,
          declarableAmount: 1000,
        },
      ],
    });
  });

  it('gives the balance the same pairs, with the amount still to pay', async () => {
    const { transfers } = await closureService.getBalance('wallet-1', 'bob');

    expect(transfers).toEqual([
      { fromUserId: 'alice', toUserId: 'charles', amount: 4000 },
      { fromUserId: 'bob', toUserId: 'david', amount: 4000 },
      { fromUserId: 'alice', toUserId: 'david', amount: 1000 },
    ]);
  });

  it('hides the pairs that are completely paid', async () => {
    prisma.repayment.groupBy.mockResolvedValue([
      {
        fromUserId: 'alice',
        toUserId: 'david',
        status: 'PAID',
        _sum: { amount: 1000 },
      },
    ]);

    const { transfers } = await closureService.getOptimizedPayments(
      'wallet-1',
      'bob',
    );

    expect(transfers.map((transfer) => transfer.toUserId)).toEqual([
      'charles',
      'david',
    ]);
  });

  it('keeps the access rules of the balance', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ status: 'OPEN' });

    await expect(
      closureService.getOptimizedPayments('wallet-1', 'bob'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.expense.aggregate).not.toHaveBeenCalled();
  });
});
