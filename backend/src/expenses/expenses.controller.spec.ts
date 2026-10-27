import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';

describe('ExpensesController', () => {
  let controller: ExpensesController;
  let expensesService: { create: Mock; findAll: Mock };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    expensesService = { create: vi.fn(), findAll: vi.fn() };
    controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
    );
  });

  it('creates an expense in the wallet of the URL as the authenticated user', async () => {
    const dto = { title: 'Courses', amount: 4599, date: '2026-10-25' };
    const expense = { id: 'expense-1' };
    expensesService.create.mockResolvedValue(expense);

    await expect(controller.create('wallet-1', dto, request)).resolves.toBe(
      expense,
    );

    expect(expensesService.create).toHaveBeenCalledWith(
      'wallet-1',
      'user-123',
      dto,
    );
  });

  it('lists the expenses of the wallet of the URL as the authenticated user', async () => {
    const page = { items: [], nextCursor: null, totalAmount: 0 };
    expensesService.findAll.mockResolvedValue(page);

    await expect(
      controller.findAll('wallet-1', { limit: 20 }, request),
    ).resolves.toBe(page);

    expect(expensesService.findAll).toHaveBeenCalledWith(
      'wallet-1',
      'user-123',
      { limit: 20 },
    );
  });
});
