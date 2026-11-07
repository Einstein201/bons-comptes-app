import { describe, expect, it } from 'vitest';
import { splitEqually } from './expense-split.js';

function amounts(shares: { amount: number }[]) {
  return shares.map((share) => share.amount);
}

describe('splitEqually', () => {
  it('gives the same share to everyone when the amount is divisible', () => {
    expect(splitEqually(9000, ['user-a', 'user-b', 'user-c'])).toEqual([
      { userId: 'user-a', amount: 3000 },
      { userId: 'user-b', amount: 3000 },
      { userId: 'user-c', amount: 3000 },
    ]);
  });

  it('gives the remaining cents to the first members by ascending id', () => {
    expect(splitEqually(101, ['user-a', 'user-b', 'user-c'])).toEqual([
      { userId: 'user-a', amount: 34 },
      { userId: 'user-b', amount: 34 },
      { userId: 'user-c', amount: 33 },
    ]);
  });

  it('does not depend on the order of the members', () => {
    expect(splitEqually(101, ['user-c', 'user-a', 'user-b'])).toEqual(
      splitEqually(101, ['user-a', 'user-b', 'user-c']),
    );
  });

  it('sorts the ids in binary order, whatever the locale', () => {
    const shares = splitEqually(4, ['b', 'a', 'B']);

    expect(shares.map((share) => share.userId)).toEqual(['B', 'a', 'b']);
    expect(amounts(shares)).toEqual([2, 1, 1]);
  });

  it('gives everything to a single member', () => {
    expect(splitEqually(4599, ['user-a'])).toEqual([
      { userId: 'user-a', amount: 4599 },
    ]);
  });

  it('keeps a zero share for the members when the amount is too small', () => {
    expect(amounts(splitEqually(1, ['user-a', 'user-b', 'user-c']))).toEqual([
      1, 0, 0,
    ]);
  });

  it.each([
    [1, 2],
    [100, 3],
    [4599, 7],
    [10001, 6],
    [2_147_483_647, 13],
  ])(
    'keeps the shares balanced and within one cent for %i among %i',
    (amount, memberCount) => {
      const memberIds = Array.from(
        { length: memberCount },
        (_, index) => `user-${index}`,
      );

      const shares = amounts(splitEqually(amount, memberIds));

      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(amount);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      expect(shares.every(Number.isInteger)).toBe(true);
    },
  );

  it('refuses to split an expense between nobody', () => {
    expect(() => splitEqually(100, [])).toThrow('au moins un membre');
  });
});
