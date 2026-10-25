import { BadRequestException } from '@nestjs/common';
import { WalletMemberStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { FinancialRulesService } from './financial-rules.service.js';

describe('FinancialRulesService', () => {
  let service: FinancialRulesService;
  let findMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findMany = vi
      .fn()
      .mockImplementation(({ where }: { where: { userId: { in: string[] } } }) =>
        Promise.resolve(where.userId.in.map((userId) => ({ userId }))),
      );
    const prisma = {
      walletMember: { findMany },
    };
    service = new FinancialRulesService(prisma as unknown as PrismaService);
  });

  it('accepts a balanced expense whose participants are wallet members', async () => {
    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 1500,
        paidById: 'payer',
        createdById: 'creator',
        splits: [
          { userId: 'member', amount: 1000 },
          { userId: 'payer', amount: 500 },
        ],
      }),
    ).resolves.toBeUndefined();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        walletId: 'wallet',
        userId: { in: ['payer', 'creator', 'member'] },
        status: WalletMemberStatus.MEMBER,
      },
      select: { userId: true },
    });
  });

  it('rejects an unbalanced expense before checking membership', async () => {
    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 1500,
        paidById: 'payer',
        createdById: 'creator',
        splits: [{ userId: 'member', amount: 1499 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects duplicate split users and non-integer amounts', async () => {
    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 200,
        paidById: 'payer',
        createdById: 'creator',
        splits: [
          { userId: 'member', amount: 100 },
          { userId: 'member', amount: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.validateRepayment({
        walletId: 'wallet',
        fromUserId: 'from',
        toUserId: 'to',
        amount: 10.5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a zero split for a member excluded from the expense', async () => {
    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 1000,
        paidById: 'payer',
        createdById: 'creator',
        splits: [
          { userId: 'payer', amount: 1000 },
          { userId: 'member', amount: 0 },
        ],
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects zero and negative amounts', async () => {
    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 0,
        paidById: 'payer',
        createdById: 'creator',
        splits: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 100,
        paidById: 'payer',
        createdById: 'creator',
        splits: [
          { userId: 'member', amount: 200 },
          { userId: 'payer', amount: -100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.validateRepayment({
        walletId: 'wallet',
        fromUserId: 'from',
        toUserId: 'to',
        amount: -500,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects amounts above the PostgreSQL INTEGER limit', async () => {
    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 2_147_483_648,
        paidById: 'payer',
        createdById: 'creator',
        splits: [{ userId: 'payer', amount: 2_147_483_648 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.validateRepayment({
        walletId: 'wallet',
        fromUserId: 'from',
        toUserId: 'to',
        amount: 2_147_483_648,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.validateRepayment({
        walletId: 'wallet',
        fromUserId: 'from',
        toUserId: 'to',
        amount: 2_147_483_647,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects expense participants who are not accepted wallet members', async () => {
    findMany.mockResolvedValue([{ userId: 'payer' }]);

    await expect(
      service.validateExpense({
        walletId: 'wallet',
        amount: 100,
        paidById: 'payer',
        createdById: 'creator',
        splits: [{ userId: 'member', amount: 100 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects self-repayments and repayments involving non-members', async () => {
    await expect(
      service.validateRepayment({
        walletId: 'wallet',
        fromUserId: 'from',
        toUserId: 'from',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();

    findMany.mockResolvedValue([{ userId: 'from' }]);
    await expect(
      service.validateRepayment({
        walletId: 'wallet',
        fromUserId: 'from',
        toUserId: 'to',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a repayment between two accepted wallet members', async () => {
    await expect(
      service.validateRepayment({
        walletId: 'wallet',
        fromUserId: 'from',
        toUserId: 'to',
        amount: 250,
      }),
    ).resolves.toBeUndefined();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        walletId: 'wallet',
        userId: { in: ['from', 'to'] },
        status: WalletMemberStatus.MEMBER,
      },
      select: { userId: true },
    });
  });
});
