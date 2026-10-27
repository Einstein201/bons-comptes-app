import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { GetWalletQueryDto } from './get-wallet-query.dto.js';

describe('GetWalletQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  function validateQuery(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: GetWalletQueryDto,
    });
  }

  it('uses a default limit of 20', async () => {
    const dto = await validateQuery({});

    expect(dto.limit).toBe(20);
    expect(dto.cursor).toBeUndefined();
  });

  it('converts the limit from the URL into a number', async () => {
    const dto = await validateQuery({ limit: '50' });

    expect(dto.limit).toBe(50);
  });

  it('accepts the maximum limit of 100', async () => {
    const dto = await validateQuery({ limit: '100' });

    expect(dto.limit).toBe(100);
  });

  it.each(['0', '101', '-5', '2.5', 'abc'])(
    'rejects the limit %s',
    async (limit) => {
      await expect(validateQuery({ limit })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('accepts a UUID cursor', async () => {
    const cursor = '6f1c2a3e-8b4d-4c5e-9f6a-7b8c9d0e1f2a';

    const dto = await validateQuery({ cursor });

    expect(dto.cursor).toBe(cursor);
  });

  it('rejects a cursor that is not a UUID', async () => {
    await expect(
      validateQuery({ cursor: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
