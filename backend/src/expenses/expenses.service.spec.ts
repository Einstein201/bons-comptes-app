import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExpensesService } from './expenses.service.js';

describe('ExpensesService.create', () => {
  let expensesService: ExpensesService;
  let prisma: {
    $transaction: Mock;
    wallet: { findUnique: Mock };
    walletMember: { findUnique: Mock };
  };
  let transaction: {
    expense: { create: Mock };
    wallet: { update: Mock };
  };

  const dto = { title: 'Courses', amount: 4599, date: '2026-10-25' };

  const createdExpense = {
    id: 'expense-1',
    title: 'Courses',
    amount: 4599,
    date: new Date('2026-10-25T00:00:00.000Z'),
    createdAt: new Date('2026-10-27T10:00:00.000Z'),
    paidBy: { id: 'user-1', name: 'Alice' },
  };

  function givenMembers(...memberIds: string[]) {
    prisma.walletMember.findUnique.mockImplementation(async ({ where }) =>
      memberIds.includes(where.walletId_userId.userId)
        ? { status: 'MEMBER' }
        : null,
    );
  }

  beforeEach(() => {
    transaction = {
      expense: { create: vi.fn().mockResolvedValue(createdExpense) },
      wallet: { update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
      wallet: { findUnique: vi.fn().mockResolvedValue({ status: 'OPEN' }) },
      walletMember: { findUnique: vi.fn() },
    };
    givenMembers('user-1');
    expensesService = new ExpensesService(prisma as unknown as PrismaService);
  });

  it('creates the expense with the authenticated user as creator and payer', async () => {
    await expensesService.create('wallet-1', 'user-1', dto);

    expect(transaction.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          walletId: 'wallet-1',
          title: 'Courses',
          amount: 4599,
          date: new Date('2026-10-25T00:00:00.000Z'),
          paidById: 'user-1',
          createdById: 'user-1',
        },
      }),
    );
  });

  it('returns the expense with its date as YYYY-MM-DD', async () => {
    await expect(
      expensesService.create('wallet-1', 'user-1', dto),
    ).resolves.toEqual({
      id: 'expense-1',
      title: 'Courses',
      amount: 4599,
      date: '2026-10-25',
      createdAt: new Date('2026-10-27T10:00:00.000Z'),
      paidBy: { id: 'user-1', name: 'Alice' },
    });
  });

  it('accepts another member as payer', async () => {
    givenMembers('user-1', 'user-2');

    await expensesService.create('wallet-1', 'user-1', {
      ...dto,
      paidById: 'user-2',
    });

    expect(transaction.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidById: 'user-2',
          createdById: 'user-1',
        }),
      }),
    );
  });

  it('refreshes the wallet updatedAt in the same transaction', async () => {
    await expensesService.create('wallet-1', 'user-1', dto);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(
      expensesService.create('unknown', 'user-1', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is not a member', async () => {
    givenMembers();

    await expect(
      expensesService.create('wallet-1', 'user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is only invited', async () => {
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'INVITED' });

    await expect(
      expensesService.create('wallet-1', 'user-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the wallet is closed', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ status: 'CLOSED' });

    await expect(
      expensesService.create('wallet-1', 'user-1', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the payer is not a member', async () => {
    await expect(
      expensesService.create('wallet-1', 'user-1', {
        ...dto,
        paidById: 'stranger',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
