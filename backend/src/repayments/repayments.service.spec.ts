import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { RepaymentsService } from './repayments.service.js';

describe('RepaymentsService confirm and cancel', () => {
  let repaymentsService: RepaymentsService;
  let prisma: {
    $transaction: Mock;
    repayment: { findFirst: Mock };
  };
  let transaction: {
    repayment: { updateMany: Mock; findUniqueOrThrow: Mock };
    wallet: { update: Mock };
  };

  // debtor rembourse recipient ; creator a créé le porte-monnaie.
  const storedRepayment = {
    fromUserId: 'debtor',
    toUserId: 'recipient',
    wallet: { createdById: 'creator', status: 'CLOSED' },
  };

  beforeEach(() => {
    transaction = {
      repayment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'repayment-1' }),
      },
      wallet: { update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
      repayment: { findFirst: vi.fn().mockResolvedValue(storedRepayment) },
    };
    repaymentsService = new RepaymentsService(
      prisma as unknown as PrismaService,
    );
  });

  it('looks for the repayment inside the wallet of the URL only', async () => {
    await repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient');

    expect(prisma.repayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'repayment-1', walletId: 'wallet-1' },
      }),
    );
  });

  it.each(['recipient', 'creator'])(
    'lets the %s confirm a pending repayment',
    async (userId) => {
      await expect(
        repaymentsService.confirm('wallet-1', 'repayment-1', userId),
      ).resolves.toEqual({ id: 'repayment-1' });

      expect(transaction.repayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'repayment-1', status: 'PENDING' },
        data: { status: 'PAID', paidAt: expect.any(Date) },
      });
    },
  );

  it.each(['debtor', 'stranger'])(
    'refuses the confirmation by the %s',
    async (userId) => {
      await expect(
        repaymentsService.confirm('wallet-1', 'repayment-1', userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.repayment.updateMany).not.toHaveBeenCalled();
    },
  );

  it('lets the debtor cancel a pending repayment', async () => {
    await repaymentsService.cancel('wallet-1', 'repayment-1', 'debtor');

    expect(transaction.repayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'repayment-1', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });

  it.each(['recipient', 'creator', 'stranger'])(
    'refuses the cancellation by the %s',
    async (userId) => {
      await expect(
        repaymentsService.cancel('wallet-1', 'repayment-1', userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.repayment.updateMany).not.toHaveBeenCalled();
    },
  );

  it('refreshes the wallet updatedAt in the same transaction', async () => {
    await repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('throws ConflictException when the repayment was already processed', async () => {
    transaction.repayment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.wallet.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the repayment is not in this wallet', async () => {
    prisma.repayment.findFirst.mockResolvedValue(null);

    await expect(
      repaymentsService.cancel('wallet-1', 'repayment-1', 'debtor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when the wallet is not closed', async () => {
    prisma.repayment.findFirst.mockResolvedValue({
      ...storedRepayment,
      wallet: { createdById: 'creator', status: 'OPEN' },
    });

    await expect(
      repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.repayment.updateMany).not.toHaveBeenCalled();
  });
});

describe('RepaymentsService.declare', () => {
  let repaymentsService: RepaymentsService;
  let prisma: { $transaction: Mock };
  let transaction: {
    $queryRaw: Mock;
    walletMember: { findUnique: Mock; findMany: Mock };
    expense: { aggregate: Mock; groupBy: Mock };
    repayment: { groupBy: Mock; aggregate: Mock; create: Mock };
    wallet: { update: Mock };
  };

  // recipient a payé 100 € pour 2 : debtor lui doit 50 € au départ.
  function givenMembers(...userIds: string[]) {
    transaction.walletMember.findUnique.mockImplementation(async ({ where }) =>
      userIds.includes(where.walletId_userId.userId)
        ? { status: 'MEMBER' }
        : null,
    );
    transaction.walletMember.findMany.mockResolvedValue(
      userIds.map((userId) => ({ userId, user: { name: userId } })),
    );
  }

  function givenAlreadyDeclared(amount: number | null) {
    transaction.repayment.aggregate.mockResolvedValue({ _sum: { amount } });
  }

  beforeEach(() => {
    transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ status: 'CLOSED' }]),
      walletMember: { findUnique: vi.fn(), findMany: vi.fn() },
      expense: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 10000 } }),
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { paidById: 'recipient', _sum: { amount: 10000 } },
          ]),
      },
      repayment: {
        groupBy: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'repayment-1' }),
      },
      wallet: { update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    givenMembers('debtor', 'recipient');
    givenAlreadyDeclared(null);
    repaymentsService = new RepaymentsService(
      prisma as unknown as PrismaService,
    );
  });

  it('creates a pending repayment in the name of the authenticated user', async () => {
    await expect(
      repaymentsService.declare('wallet-1', 'debtor', {
        toUserId: 'recipient',
        amount: 2500,
      }),
    ).resolves.toEqual({ id: 'repayment-1' });

    expect(transaction.repayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          walletId: 'wallet-1',
          fromUserId: 'debtor',
          toUserId: 'recipient',
          amount: 2500,
          status: 'PENDING',
        },
      }),
    );
    expect(transaction.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('locks the wallet before checking the remaining debt', async () => {
    await repaymentsService.declare('wallet-1', 'debtor', {
      toUserId: 'recipient',
      amount: 2500,
    });

    const [sqlParts] = transaction.$queryRaw.mock.calls[0];
    expect(sqlParts.join('')).toContain('FOR UPDATE');
  });

  it('accepts exactly the remaining debt', async () => {
    givenAlreadyDeclared(2000);

    await repaymentsService.declare('wallet-1', 'debtor', {
      toUserId: 'recipient',
      amount: 3000,
    });

    expect(transaction.repayment.create).toHaveBeenCalledOnce();
  });

  it('refuses an amount above the remaining debt', async () => {
    givenAlreadyDeclared(2000);

    await expect(
      repaymentsService.declare('wallet-1', 'debtor', {
        toUserId: 'recipient',
        amount: 3001,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.repayment.create).not.toHaveBeenCalled();
  });

  it('counts the pending and paid repayments of the same pair', async () => {
    await repaymentsService.declare('wallet-1', 'debtor', {
      toUserId: 'recipient',
      amount: 2500,
    });

    expect(transaction.repayment.aggregate).toHaveBeenCalledWith({
      where: {
        walletId: 'wallet-1',
        fromUserId: 'debtor',
        toUserId: 'recipient',
        status: { in: ['PENDING', 'PAID'] },
      },
      _sum: { amount: true },
    });
  });

  it('computes the initial debt without the paid repayments', async () => {
    transaction.repayment.groupBy.mockResolvedValue([
      { fromUserId: 'debtor', toUserId: 'recipient', _sum: { amount: 2000 } },
    ]);
    givenAlreadyDeclared(2000);

    await repaymentsService.declare('wallet-1', 'debtor', {
      toUserId: 'recipient',
      amount: 3000,
    });

    expect(transaction.repayment.create).toHaveBeenCalledOnce();
  });

  it('refuses a repayment to a member who is not owed anything by the user', async () => {
    givenMembers('debtor', 'other', 'recipient');
    transaction.expense.aggregate.mockResolvedValue({
      _sum: { amount: 9000 },
    });
    transaction.expense.groupBy.mockResolvedValue([
      { paidById: 'recipient', _sum: { amount: 9000 } },
    ]);

    await expect(
      repaymentsService.declare('wallet-1', 'debtor', {
        toUserId: 'other',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws BadRequestException for a repayment to oneself', async () => {
    await expect(
      repaymentsService.declare('wallet-1', 'debtor', {
        toUserId: 'debtor',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(
      repaymentsService.declare('unknown', 'debtor', {
        toUserId: 'recipient',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException when the user is not a member', async () => {
    await expect(
      repaymentsService.declare('wallet-1', 'stranger', {
        toUserId: 'recipient',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ConflictException when the wallet is still open', async () => {
    transaction.$queryRaw.mockResolvedValue([{ status: 'OPEN' }]);

    await expect(
      repaymentsService.declare('wallet-1', 'debtor', {
        toUserId: 'recipient',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws BadRequestException when the recipient is not a member', async () => {
    await expect(
      repaymentsService.declare('wallet-1', 'debtor', {
        toUserId: 'stranger',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.repayment.create).not.toHaveBeenCalled();
  });
});
