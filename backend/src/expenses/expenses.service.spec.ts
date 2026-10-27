import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { encodeCursor } from '../wallets/wallet-pagination.js';
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

describe('ExpensesService.findAll', () => {
  let expensesService: ExpensesService;
  let prisma: {
    wallet: { findUnique: Mock };
    walletMember: { findUnique: Mock };
    expense: { findMany: Mock; aggregate: Mock };
  };

  function expenseRow(id: string, date: string) {
    return {
      id,
      title: `Dépense ${id}`,
      amount: 1000,
      date: new Date(`${date}T00:00:00.000Z`),
      createdAt: new Date('2026-10-27T10:00:00.000Z'),
      paidBy: { id: 'user-1', name: 'Alice' },
    };
  }

  beforeEach(() => {
    prisma = {
      wallet: { findUnique: vi.fn().mockResolvedValue({ status: 'OPEN' }) },
      walletMember: {
        findUnique: vi.fn().mockResolvedValue({ status: 'MEMBER' }),
      },
      expense: {
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    };
    expensesService = new ExpensesService(prisma as unknown as PrismaService);
  });

  it('returns an empty list and a total of 0 when there is no expense', async () => {
    await expect(
      expensesService.findAll('wallet-1', 'user-1', { limit: 20 }),
    ).resolves.toEqual({ items: [], nextCursor: null, totalAmount: 0 });
  });

  it('returns the expenses with their date as YYYY-MM-DD', async () => {
    prisma.expense.findMany.mockResolvedValue([
      expenseRow('e-1', '2026-10-25'),
    ]);

    const result = await expensesService.findAll('wallet-1', 'user-1', {
      limit: 20,
    });

    expect(result.items).toEqual([
      {
        id: 'e-1',
        title: 'Dépense e-1',
        amount: 1000,
        date: '2026-10-25',
        createdAt: new Date('2026-10-27T10:00:00.000Z'),
        paidBy: { id: 'user-1', name: 'Alice' },
      },
    ]);
  });

  it('sorts by date then id, newest first, and asks for one extra row', async () => {
    await expensesService.findAll('wallet-1', 'user-1', { limit: 20 });

    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: 'wallet-1' },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('computes the total of the whole wallet with a database SUM', async () => {
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 12345 } });

    const result = await expensesService.findAll('wallet-1', 'user-1', {
      limit: 20,
    });

    expect(result.totalAmount).toBe(12345);
    expect(prisma.expense.aggregate).toHaveBeenCalledWith({
      where: { walletId: 'wallet-1' },
      _sum: { amount: true },
    });
  });

  it('returns a nextCursor when there are more expenses than the limit', async () => {
    const rows = [
      expenseRow('e-3', '2026-10-27'),
      expenseRow('e-2', '2026-10-26'),
      expenseRow('e-1', '2026-10-25'),
    ];
    prisma.expense.findMany.mockResolvedValue(rows);

    const result = await expensesService.findAll('wallet-1', 'user-1', {
      limit: 2,
    });

    expect(result.items.map((item) => item.id)).toEqual(['e-3', 'e-2']);
    expect(result.nextCursor).toBe(encodeCursor(rows[1].date, 'e-2'));
  });

  it('resumes after the cursor', async () => {
    const date = new Date('2026-10-26T00:00:00.000Z');

    await expensesService.findAll('wallet-1', 'user-1', {
      limit: 20,
      cursor: encodeCursor(date, 'e-2'),
    });

    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          walletId: 'wallet-1',
          OR: [{ date: { lt: date } }, { date, id: { lt: 'e-2' } }],
        },
      }),
    );
  });

  it('rejects an invalid cursor before querying the database', async () => {
    await expect(
      expensesService.findAll('wallet-1', 'user-1', {
        limit: 20,
        cursor: 'garbage',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
  });

  it('lets a member read the expenses of a closed wallet', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ status: 'CLOSED' });

    await expect(
      expensesService.findAll('wallet-1', 'user-1', { limit: 20 }),
    ).resolves.toEqual({ items: [], nextCursor: null, totalAmount: 0 });
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(
      expensesService.findAll('unknown', 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is only invited', async () => {
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'INVITED' });

    await expect(
      expensesService.findAll('wallet-1', 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.aggregate).not.toHaveBeenCalled();
  });
});


describe('ExpensesService.remove', () => {
  let expensesService: ExpensesService;
  let prisma: { $transaction: Mock };
  let transaction: {
    expense: { findFirst: Mock; delete: Mock };
    wallet: { update: Mock };
  };

  function givenExpense(paidById: string, walletStatus = 'OPEN') {
    transaction.expense.findFirst.mockResolvedValue({
      paidById,
      wallet: { status: walletStatus },
    });
  }

  beforeEach(() => {
    transaction = {
      expense: { findFirst: vi.fn(), delete: vi.fn() },
      wallet: { update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    expensesService = new ExpensesService(prisma as unknown as PrismaService);
  });

  it('looks for the expense inside the wallet of the URL only', async () => {
    givenExpense('user-1');

    await expensesService.remove('wallet-1', 'expense-1', 'user-1');

    expect(transaction.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense-1', walletId: 'wallet-1' },
      }),
    );
  });

  it('lets the payer delete the expense and refreshes the wallet updatedAt', async () => {
    givenExpense('user-1');

    await expensesService.remove('wallet-1', 'expense-1', 'user-1');

    expect(transaction.expense.delete).toHaveBeenCalledWith({
      where: { id: 'expense-1' },
    });
    expect(transaction.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('throws NotFoundException when the expense is not in this wallet', async () => {
    transaction.expense.findFirst.mockResolvedValue(null);

    await expect(
      expensesService.remove('wallet-1', 'expense-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.expense.delete).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the wallet is closed', async () => {
    givenExpense('user-1', 'CLOSED');

    await expect(
      expensesService.remove('wallet-1', 'expense-1', 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.expense.delete).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is not the payer', async () => {
    givenExpense('user-2');

    await expect(
      expensesService.remove('wallet-1', 'expense-1', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.expense.delete).not.toHaveBeenCalled();
    expect(transaction.wallet.update).not.toHaveBeenCalled();
  });
});
