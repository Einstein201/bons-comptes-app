import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, toPage } from './wallet-pagination.js';

const encodeRaw = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('wallet cursors', () => {
  it('round-trips a date and an identifier', () => {
    const date = new Date('2026-10-25T22:50:05.123Z');

    const cursor = encodeCursor(date, 'wallet-123');

    expect(decodeCursor(cursor)).toEqual({ date, id: 'wallet-123' });
  });

  it('produces a URL-safe opaque string', () => {
    const cursor = encodeCursor(new Date(), 'a/b+c?d=e&f');

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64 JSON', 'not-a-cursor'],
    ['an empty string', ''],
    ['a JSON object', encodeRaw({ date: '2026-10-25T22:50:05.123Z', id: 'x' })],
    ['an array of the wrong length', encodeRaw(['2026-10-25T22:50:05.123Z'])],
    ['a non-string date', encodeRaw([1761432605123, 'wallet-123'])],
    ['a non-string identifier', encodeRaw(['2026-10-25T22:50:05.123Z', 42])],
    ['an empty identifier', encodeRaw(['2026-10-25T22:50:05.123Z', ''])],
    ['an invalid date', encodeRaw(['not-a-date', 'wallet-123'])],
    ['a non-canonical date', encodeRaw(['2026-10-25', 'wallet-123'])],
  ])('rejects %s with HTTP 400', (_case, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(BadRequestException);
  });
});

describe('toPage', () => {
  const rows = ['a', 'b', 'c'];
  const toCursor = (row: string) => `cursor-${row}`;

  it('returns every row and no cursor when fewer rows than the limit were found', () => {
    expect(toPage(rows, 5, (row) => row.toUpperCase(), toCursor)).toEqual({
      items: ['A', 'B', 'C'],
      nextCursor: null,
    });
  });

  it('returns no cursor when exactly as many rows as the limit were found', () => {
    expect(toPage(rows, 3, (row) => row, toCursor)).toEqual({
      items: ['a', 'b', 'c'],
      nextCursor: null,
    });
  });

  it('drops the extra row and points the cursor to the last returned row', () => {
    expect(toPage(rows, 2, (row) => row, toCursor)).toEqual({
      items: ['a', 'b'],
      nextCursor: 'cursor-b',
    });
  });

  it('handles an empty result', () => {
    expect(toPage([], 20, (row) => row, toCursor)).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
