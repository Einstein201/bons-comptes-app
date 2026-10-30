import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ListRepaymentsQueryDto } from './list-repayments-query.dto.js';

describe('ListRepaymentsQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  function validateQuery(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: ListRepaymentsQueryDto,
    });
  }

  it('uses a default limit of 20 and no status filter', async () => {
    const dto = await validateQuery({});

    expect(dto.limit).toBe(20);
    expect(dto.status).toBeUndefined();
    expect(dto.cursor).toBeUndefined();
  });

  it.each(['PENDING', 'PAID', 'CANCELLED'])(
    'accepts the status %s',
    async (status) => {
      const dto = await validateQuery({ status });

      expect(dto.status).toBe(status);
    },
  );

  it.each(['DONE', 'pending', ''])(
    'rejects the status "%s"',
    async (status) => {
      await expect(validateQuery({ status })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('converts the limit from the URL into a number', async () => {
    const dto = await validateQuery({ limit: '100' });

    expect(dto.limit).toBe(100);
  });

  it.each(['0', '101', '2.5', 'abc'])('rejects the limit %s', async (limit) => {
    await expect(validateQuery({ limit })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a cursor longer than 200 characters', async () => {
    await expect(
      validateQuery({ cursor: 'a'.repeat(201) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
