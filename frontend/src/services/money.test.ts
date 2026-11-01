import { expect, it } from 'vitest';
import { formatCents } from './money';

it.each([[1234, '12,34'], [-1234, '-12,34'], [0, '0,00'], [1, '0,01']])(
  'affiche %s centimes en dollars canadiens', (amount, expected) => {
    expect(formatCents(amount)).toContain(expected);
    expect(formatCents(amount)).toContain('$');
  },
);

it.each([1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejette un montant invalide : %s', (amount) => {
    expect(() => formatCents(amount)).toThrow('entier sûr en centimes');
  },
);
