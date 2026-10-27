import { describe, expect, it } from 'vitest';
import { calculateBalances } from './balance-calculator.js';

function member(userId: string, paidAmount: number) {
  return { userId, name: `Nom ${userId}`, paidAmount };
}

function sumOfBalances(balances: { balance: number }[]) {
  return balances.reduce((total, item) => total + item.balance, 0);
}

describe('calculateBalances', () => {
  it('reproduces the example of the ticket', () => {
    const result = calculateBalances(
      10001,
      [member('user-a', 7000), member('user-b', 3001)],
      [],
    );

    expect(result.balances).toEqual([
      {
        userId: 'user-a',
        name: 'Nom user-a',
        paidAmount: 7000,
        shareAmount: 5001,
        balance: 1999,
      },
      {
        userId: 'user-b',
        name: 'Nom user-b',
        paidAmount: 3001,
        shareAmount: 5000,
        balance: -1999,
      },
    ]);
    expect(result.transfers).toEqual([
      { fromUserId: 'user-b', toUserId: 'user-a', amount: 1999 },
    ]);
  });

  it('splits the total equally when there is no remainder', () => {
    const { balances } = calculateBalances(
      9000,
      [member('user-a', 9000), member('user-b', 0), member('user-c', 0)],
      [],
    );

    expect(balances.map((item) => item.shareAmount)).toEqual([
      3000, 3000, 3000,
    ]);
    expect(balances.map((item) => item.balance)).toEqual([6000, -3000, -3000]);
  });

  it('gives the remaining cents to the first members sorted by id', () => {
    const { balances } = calculateBalances(
      101,
      [member('user-c', 0), member('user-a', 101), member('user-b', 0)],
      [],
    );

    expect(balances.map((item) => item.userId)).toEqual([
      'user-a',
      'user-b',
      'user-c',
    ]);
    expect(balances.map((item) => item.shareAmount)).toEqual([34, 34, 33]);
    expect(sumOfBalances(balances)).toBe(0);
  });

  it('returns zero balances and no transfer when there is no expense', () => {
    const result = calculateBalances(
      0,
      [member('user-a', 0), member('user-b', 0)],
      [],
    );

    expect(result.balances.map((item) => item.balance)).toEqual([0, 0]);
    expect(result.transfers).toEqual([]);
  });

  it('applies a paid repayment: the sender owes less, the recipient receives less', () => {
    const result = calculateBalances(
      10000,
      [member('user-a', 10000), member('user-b', 0)],
      [{ fromUserId: 'user-b', toUserId: 'user-a', amount: 2000 }],
    );

    expect(result.balances.map((item) => item.balance)).toEqual([3000, -3000]);
    expect(result.transfers).toEqual([
      { fromUserId: 'user-b', toUserId: 'user-a', amount: 3000 },
    ]);
  });

  it('needs no transfer once every debt is repaid', () => {
    const result = calculateBalances(
      10000,
      [member('user-a', 10000), member('user-b', 0)],
      [{ fromUserId: 'user-b', toUserId: 'user-a', amount: 5000 }],
    );

    expect(result.balances.map((item) => item.balance)).toEqual([0, 0]);
    expect(result.transfers).toEqual([]);
  });

  it('matches debtors and creditors in a deterministic order', () => {
    const result = calculateBalances(
      12000,
      [
        member('user-d', 0),
        member('user-b', 6000),
        member('user-c', 0),
        member('user-a', 6000),
      ],
      [],
    );

    expect(result.transfers).toEqual([
      { fromUserId: 'user-c', toUserId: 'user-a', amount: 3000 },
      { fromUserId: 'user-d', toUserId: 'user-b', amount: 3000 },
    ]);
  });

  it('splits a debt between several creditors when needed', () => {
    const result = calculateBalances(
      9000,
      [member('user-a', 4000), member('user-b', 5000), member('user-c', 0)],
      [],
    );

    expect(result.balances.map((item) => item.balance)).toEqual([
      1000, 2000, -3000,
    ]);
    expect(result.transfers).toEqual([
      { fromUserId: 'user-c', toUserId: 'user-a', amount: 1000 },
      { fromUserId: 'user-c', toUserId: 'user-b', amount: 2000 },
    ]);
  });

  it('always produces balances whose sum is zero', () => {
    const { balances } = calculateBalances(
      100003,
      [
        member('user-a', 50000),
        member('user-b', 30003),
        member('user-c', 20000),
        member('user-d', 0),
      ],
      [{ fromUserId: 'user-d', toUserId: 'user-a', amount: 777 }],
    );

    expect(sumOfBalances(balances)).toBe(0);
  });

  it('refuses an unbalanced result', () => {
    expect(() =>
      calculateBalances(
        1000,
        [member('user-a', 1000), member('user-b', 0)],
        [{ fromUserId: 'user-b', toUserId: 'someone-else', amount: 100 }],
      ),
    ).toThrow('Le bilan est déséquilibré');
  });
});
