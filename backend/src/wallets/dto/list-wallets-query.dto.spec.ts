import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ListWalletsQueryDto } from './list-wallets-query.dto.js';

describe('ListWalletsQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const parse = (query: Record<string, unknown>) =>
    pipe.transform(query, { type: 'query', metatype: ListWalletsQueryDto });

  it('accepts an empty query', async () => {
    await expect(parse({})).resolves.toEqual({});
  });

  it.each([
    ['1', 1],
    ['20', 20],
    ['100', 100],
  ])('converts and accepts limit=%s', async (limit, expected) => {
    await expect(parse({ limit })).resolves.toMatchObject({ limit: expected });
  });

  it.each([
    ['zero', '0'],
    ['above the maximum', '101'],
    ['negative', '-1'],
    ['decimal', '1.5'],
    ['not a number', 'abc'],
    ['empty', ''],
    ['repeated', ['1', '2']],
  ])('rejects a limit that is %s', async (_case, limit) => {
    await expect(parse({ limit })).rejects.toThrow();
  });

  it('accepts one cursor per section', async () => {
    const query = {
      openCursor: 'a',
      closedCursor: 'b',
      invitationsCursor: 'c',
    };

    await expect(parse(query)).resolves.toMatchObject(query);
  });

  it.each(['openCursor', 'closedCursor', 'invitationsCursor'])(
    'rejects a %s longer than 200 characters',
    async (name) => {
      await expect(parse({ [name]: 'a'.repeat(201) })).rejects.toThrow();
    },
  );

  it('rejects a repeated cursor', async () => {
    await expect(parse({ openCursor: ['a', 'b'] })).rejects.toThrow();
  });

  it('rejects a client-supplied user identifier', async () => {
    await expect(parse({ userId: 'someone-else' })).rejects.toThrow();
  });
});
