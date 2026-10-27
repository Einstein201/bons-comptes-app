import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateExpenseDto } from './create-expense.dto.js';

describe('CreateExpenseDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validExpense = {
    title: 'Courses',
    amount: 4599,
    date: '2026-10-25',
  };

  function validateBody(body: Record<string, unknown>) {
    return pipe.transform(body, { type: 'body', metatype: CreateExpenseDto });
  }

  it('accepts a valid expense without payer', async () => {
    const dto = await validateBody(validExpense);

    expect(dto).toEqual(validExpense);
  });

  it('accepts a valid expense with a payer', async () => {
    const paidById = '6f1c2a3e-8b4d-4c5e-9f6a-7b8c9d0e1f2a';

    const dto = await validateBody({ ...validExpense, paidById });

    expect(dto.paidById).toBe(paidById);
  });

  it('trims the title', async () => {
    const dto = await validateBody({ ...validExpense, title: '  Courses  ' });

    expect(dto.title).toBe('Courses');
  });

  it('keeps the amount in cents without conversion', async () => {
    const dto = await validateBody({ ...validExpense, amount: 1 });

    expect(dto.amount).toBe(1);
  });

  it('accepts the maximum amount', async () => {
    const dto = await validateBody({ ...validExpense, amount: 2_147_483_647 });

    expect(dto.amount).toBe(2_147_483_647);
  });

  it.each([
    ['missing title', { title: undefined }],
    ['empty title', { title: '' }],
    ['whitespace-only title', { title: '   ' }],
    ['title too long', { title: 'a'.repeat(101) }],
    ['missing amount', { amount: undefined }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -100 }],
    ['decimal amount', { amount: 45.99 }],
    ['amount as text', { amount: '4599' }],
    ['amount above the limit', { amount: 2_147_483_648 }],
    ['missing date', { date: undefined }],
    ['date with time', { date: '2026-10-25T10:00:00Z' }],
    ['date in French format', { date: '25/10/2026' }],
    ['impossible date', { date: '2026-02-30' }],
    ['date as text', { date: 'hier' }],
    ['payer that is not a UUID', { paidById: 'someone' }],
    ['null payer', { paidById: null }],
  ])('rejects %s', async (_case, change) => {
    await expect(
      validateBody({ ...validExpense, ...change }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['createdById', 'walletId'])(
    'rejects a client-supplied %s',
    async (property) => {
      await expect(
        validateBody({ ...validExpense, [property]: 'someone-else' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
