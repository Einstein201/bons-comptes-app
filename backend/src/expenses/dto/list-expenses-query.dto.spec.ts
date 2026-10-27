import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ListExpensesQueryDto } from './list-expenses-query.dto.js';

describe('ListExpensesQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  function validateQuery(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: ListExpensesQueryDto,
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

  it('accepts a cursor', async () => {
    const dto = await validateQuery({ cursor: 'eyJhIjoxfQ' });

    expect(dto.cursor).toBe('eyJhIjoxfQ');
  });

  it('rejects a cursor longer than 200 characters', async () => {
    await expect(
      validateQuery({ cursor: 'a'.repeat(201) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown parameter', async () => {
    await expect(
      validateQuery({ userId: 'someone-else' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
