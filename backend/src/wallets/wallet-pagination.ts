import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DecodedCursor {
  date: Date;
  id: string;
}

// Curseur opaque : la date de tri et l'identifiant de la dernière ligne renvoyée.
export function encodeCursor(date: Date, id: string): string {
  return Buffer.from(JSON.stringify([date.toISOString(), id])).toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string): DecodedCursor {
  const invalidCursor = new BadRequestException(
    'Curseur de pagination invalide.',
  );

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor;
  }

  if (
    !Array.isArray(decoded) ||
    decoded.length !== 2 ||
    typeof decoded[0] !== 'string' ||
    typeof decoded[1] !== 'string' ||
    decoded[1] === ''
  ) {
    throw invalidCursor;
  }

  const date = new Date(decoded[0]);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== decoded[0]) {
    throw invalidCursor;
  }

  return { date, id: decoded[1] };
}

// Les requêtes demandent `limit + 1` lignes : la ligne en trop indique qu'une page suivante existe.
export function toPage<Row, Item>(
  rows: Row[],
  limit: number,
  toItem: (row: Row) => Item,
  toCursor: (row: Row) => string,
): Page<Item> {
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

  return {
    items: pageRows.map(toItem),
    nextCursor: hasNextPage ? toCursor(pageRows[pageRows.length - 1]) : null,
  };
}
