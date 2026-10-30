import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipsService } from './memberships.service.js';

describe('MembershipsService', () => {
  let membershipsService: MembershipsService;
  let prisma: { $transaction: Mock };
  let transaction: {
    $queryRaw: Mock;
    walletMember: { findUnique: Mock; delete: Mock };
    expense: { count: Mock };
    expenseSplit: { count: Mock };
    repayment: { count: Mock };
    wallet: { update: Mock };
  };

  function givenWallet(status = 'OPEN') {
    transaction.$queryRaw.mockResolvedValue([
      { status, createdById: 'creator' },
    ]);
  }

  function givenMembers(...userIds: string[]) {
    transaction.walletMember.findUnique.mockImplementation(async ({ where }) =>
      userIds.includes(where.walletId_userId.userId)
        ? { status: 'MEMBER' }
        : null,
    );
  }

  function givenHistory(expenses: number, splits: number, repayments: number) {
    transaction.expense.count.mockResolvedValue(expenses);
    transaction.expenseSplit.count.mockResolvedValue(splits);
    transaction.repayment.count.mockResolvedValue(repayments);
  }

  beforeEach(() => {
    transaction = {
      $queryRaw: vi.fn(),
      walletMember: { findUnique: vi.fn(), delete: vi.fn() },
      expense: { count: vi.fn() },
      expenseSplit: { count: vi.fn() },
      repayment: { count: vi.fn() },
      wallet: { update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    givenWallet();
    givenMembers('creator', 'member');
    givenHistory(0, 0, 0);
    membershipsService = new MembershipsService(
      prisma as unknown as PrismaService,
    );
  });

  describe('leave', () => {
    it('deletes the membership of a member without history', async () => {
      await membershipsService.leave('wallet-1', 'member');

      expect(transaction.walletMember.delete).toHaveBeenCalledWith({
        where: { walletId_userId: { walletId: 'wallet-1', userId: 'member' } },
      });
      expect(transaction.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { updatedAt: expect.any(Date) },
      });
    });

    it('locks the wallet before any check', async () => {
      await membershipsService.leave('wallet-1', 'member');

      const [sqlParts] = transaction.$queryRaw.mock.calls[0];
      expect(sqlParts.join('')).toContain('FOR UPDATE');
    });

    it('throws ForbiddenException when the creator tries to leave', async () => {
      await expect(
        membershipsService.leave('wallet-1', 'creator'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.walletMember.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the user is not a member', async () => {
      await expect(
        membershipsService.leave('wallet-1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when the wallet does not exist', async () => {
      transaction.$queryRaw.mockResolvedValue([]);

      await expect(
        membershipsService.leave('unknown', 'member'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the wallet is closed', async () => {
      givenWallet('CLOSED');

      await expect(
        membershipsService.leave('wallet-1', 'member'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transaction.walletMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lets the creator remove a member without history', async () => {
      await membershipsService.remove('wallet-1', 'member', 'creator');

      expect(transaction.walletMember.delete).toHaveBeenCalledWith({
        where: { walletId_userId: { walletId: 'wallet-1', userId: 'member' } },
      });
    });

    it('throws ForbiddenException when the user is not the creator', async () => {
      givenMembers('creator', 'member', 'other');

      await expect(
        membershipsService.remove('wallet-1', 'other', 'member'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.walletMember.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the creator tries to remove himself', async () => {
      await expect(
        membershipsService.remove('wallet-1', 'creator', 'creator'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when the target is not an accepted member', async () => {
      transaction.walletMember.findUnique.mockResolvedValue({
        status: 'INVITED',
      });

      await expect(
        membershipsService.remove('wallet-1', 'invited', 'creator'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(transaction.walletMember.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the wallet is closed', async () => {
      givenWallet('CLOSED');

      await expect(
        membershipsService.remove('wallet-1', 'member', 'creator'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('shared history', () => {
    it.each([
      ['an expense of the wallet', 1, 0, 0],
      ['an expense split of the member', 0, 1, 0],
      ['a repayment of the member', 0, 0, 1],
    ])(
      'refuses the departure and the removal when there is %s',
      async (_case, expenses, splits, repayments) => {
        givenHistory(expenses, splits, repayments);

        await expect(
          membershipsService.leave('wallet-1', 'member'),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          membershipsService.remove('wallet-1', 'member', 'creator'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(transaction.walletMember.delete).not.toHaveBeenCalled();
      },
    );

    it('counts every expense of the wallet, whoever paid or entered it', async () => {
      await membershipsService.leave('wallet-1', 'member');

      expect(transaction.expense.count).toHaveBeenCalledWith({
        where: { walletId: 'wallet-1' },
      });
    });

    it('counts the splits and repayments of the member in this wallet only', async () => {
      await membershipsService.leave('wallet-1', 'member');

      expect(transaction.expenseSplit.count).toHaveBeenCalledWith({
        where: { userId: 'member', expense: { walletId: 'wallet-1' } },
      });
      expect(transaction.repayment.count).toHaveBeenCalledWith({
        where: {
          walletId: 'wallet-1',
          OR: [{ fromUserId: 'member' }, { toUserId: 'member' }],
        },
      });
    });
  });
});
