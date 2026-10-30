import { describe, expect, it } from 'vitest';
import { calculateBalances, optimizeTransfers } from './balance-calculator.js';

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

describe('optimizeTransfers', () => {
  function balance(userId: string, amount: number) {
    return { userId, balance: amount };
  }

  it('returns no transfer when every balance is zero', () => {
    expect(
      optimizeTransfers([balance('user-a', 0), balance('user-b', 0)]),
    ).toEqual([]);
  });

  it('matches the largest debt with the largest credit first', () => {
    const transfers = optimizeTransfers([
      balance('user-a', 1000),
      balance('user-b', 2000),
      balance('user-c', -500),
      balance('user-d', -2500),
    ]);

    expect(transfers).toEqual([
      { fromUserId: 'user-d', toUserId: 'user-b', amount: 2000 },
      { fromUserId: 'user-c', toUserId: 'user-a', amount: 500 },
      { fromUserId: 'user-d', toUserId: 'user-a', amount: 500 },
    ]);
  });

  it('splits a debt between several creditors when needed', () => {
    expect(
      optimizeTransfers([
        balance('user-a', 1000),
        balance('user-b', 2000),
        balance('user-c', -3000),
      ]),
    ).toEqual([
      { fromUserId: 'user-c', toUserId: 'user-b', amount: 2000 },
      { fromUserId: 'user-c', toUserId: 'user-a', amount: 1000 },
    ]);
  });

  it('breaks ties by user id to stay deterministic', () => {
    const transfers = optimizeTransfers([
      balance('user-d', -3000),
      balance('user-b', 3000),
      balance('user-c', -3000),
      balance('user-a', 3000),
    ]);

    expect(transfers).toEqual([
      { fromUserId: 'user-c', toUserId: 'user-a', amount: 3000 },
      { fromUserId: 'user-d', toUserId: 'user-b', amount: 3000 },
    ]);
  });

  it('returns at most n - 1 transfers that settle every balance', () => {
    const balances = [
      balance('user-a', 4321),
      balance('user-b', -1234),
      balance('user-c', 999),
      balance('user-d', -2000),
      balance('user-e', -2086),
    ];

    const transfers = optimizeTransfers(balances);

    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
    for (const item of balances) {
      const received = transfers
        .filter((transfer) => transfer.toUserId === item.userId)
        .reduce((sum, transfer) => sum + transfer.amount, 0);
      const sent = transfers
        .filter((transfer) => transfer.fromUserId === item.userId)
        .reduce((sum, transfer) => sum + transfer.amount, 0);

      expect(received - sent).toBe(item.balance);
    }
    for (const transfer of transfers) {
      expect(Number.isInteger(transfer.amount)).toBe(true);
      expect(transfer.amount).toBeGreaterThan(0);
    }
  });
});
