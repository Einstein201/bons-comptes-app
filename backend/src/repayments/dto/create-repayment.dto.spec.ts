import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateRepaymentDto } from './create-repayment.dto.js';

describe('CreateRepaymentDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validRepayment = {
    toUserId: '6f1c2a3e-8b4d-4c5e-9f6a-7b8c9d0e1f2a',
    amount: 2500,
  };

  function validateBody(body: Record<string, unknown>) {
    return pipe.transform(body, { type: 'body', metatype: CreateRepaymentDto });
  }

  it('accepts a valid repayment', async () => {
    await expect(validateBody(validRepayment)).resolves.toEqual(validRepayment);
  });

  it.each([
    ['missing recipient', { toUserId: undefined }],
    ['recipient that is not a UUID', { toUserId: 'someone' }],
    ['missing amount', { amount: undefined }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -100 }],
    ['decimal amount', { amount: 25.5 }],
    ['amount as text', { amount: '2500' }],
    ['amount above the limit', { amount: 2_147_483_648 }],
  ])('rejects %s', async (_case, change) => {
    await expect(
      validateBody({ ...validRepayment, ...change }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['fromUserId', 'status', 'walletId'])(
    'rejects a client-supplied %s',
    async (property) => {
      await expect(
        validateBody({ ...validRepayment, [property]: 'forced-value' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
