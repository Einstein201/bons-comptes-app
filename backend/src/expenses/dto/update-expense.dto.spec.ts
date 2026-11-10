import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpdateExpenseDto } from './update-expense.dto.js';

describe('UpdateExpenseDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  function validateBody(body: Record<string, unknown>) {
    return pipe.transform(body, {
      type: 'body',
      metatype: UpdateExpenseDto,
    });
  }

  it('accepts each modifiable field independently', async () => {
    await expect(validateBody({ title: 'Nouvelle dépense' })).resolves.toMatchObject({
      title: 'Nouvelle dépense',
    });
    await expect(validateBody({ amount: 1 })).resolves.toMatchObject({
      amount: 1,
    });
  });

  it('accepts several fields in the same patch', async () => {
    await expect(
      validateBody({ title: 'Train', amount: 2500 }),
    ).resolves.toMatchObject({
      title: 'Train',
      amount: 2500,
    });
  });

  it('trims a valid title', async () => {
    await expect(validateBody({ title: '  Train  ' })).resolves.toMatchObject({
      title: 'Train',
    });
  });

  it.each([
    ['empty title', { title: '' }],
    ['whitespace-only title', { title: '   ' }],
    ['title longer than 100 characters', { title: 'x'.repeat(101) }],
    ['null title', { title: null }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -1 }],
    ['decimal amount', { amount: 1.5 }],
    ['amount as text', { amount: '100' }],
    ['amount above the database limit', { amount: 2_147_483_648 }],
    ['null amount', { amount: null }],
  ])('rejects %s', async (_label, patch) => {
    await expect(validateBody(patch)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each(['date', 'paidById', 'createdById', 'walletId'])(
    'rejects protected or unrelated field %s',
    async (field) => {
      await expect(
        validateBody({ title: 'Train', [field]: 'another-value' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
