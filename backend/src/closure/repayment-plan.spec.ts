import { describe, expect, it } from 'vitest';
import { calculateRepaymentPlan } from './repayment-plan.js';

function member(userId: string, paidAmount: number) {
  return { userId, name: `Nom ${userId}`, paidAmount };
}

// Au départ : alice doit 50 € à charles et 10 € à david, bob doit 40 € à david.
const data = {
  totalAmount: 24000,
  memberPayments: [
    member('alice', 0),
    member('bob', 2000),
    member('charles', 11000),
    member('david', 11000),
  ],
  paidRepayments: [],
  pendingRepayments: [],
};

describe('calculateRepaymentPlan', () => {
  it('returns the initial plan when there is no repayment', () => {
    expect(calculateRepaymentPlan(data)).toEqual([
      {
        fromUserId: 'alice',
        toUserId: 'charles',
        initialAmount: 5000,
        remainingAmount: 5000,
        declarableAmount: 5000,
      },
      {
        fromUserId: 'bob',
        toUserId: 'david',
        initialAmount: 4000,
        remainingAmount: 4000,
        declarableAmount: 4000,
      },
      {
        fromUserId: 'alice',
        toUserId: 'david',
        initialAmount: 1000,
        remainingAmount: 1000,
        declarableAmount: 1000,
      },
    ]);
  });

  it('keeps the same pairs after a partial paid repayment', () => {
    const plan = calculateRepaymentPlan({
      ...data,
      paidRepayments: [
        { fromUserId: 'alice', toUserId: 'charles', amount: 1000 },
      ],
    });

    expect(plan.map((item) => [item.fromUserId, item.toUserId])).toEqual([
      ['alice', 'charles'],
      ['bob', 'david'],
      ['alice', 'david'],
    ]);
    expect(plan[0].remainingAmount).toBe(4000);
    expect(plan[0].declarableAmount).toBe(4000);
  });

  it('deducts the pending repayments only from the declarable amount', () => {
    const plan = calculateRepaymentPlan({
      ...data,
      paidRepayments: [{ fromUserId: 'bob', toUserId: 'david', amount: 1000 }],
      pendingRepayments: [
        { fromUserId: 'bob', toUserId: 'david', amount: 1500 },
      ],
    });

    expect(plan[1]).toEqual({
      fromUserId: 'bob',
      toUserId: 'david',
      initialAmount: 4000,
      remainingAmount: 3000,
      declarableAmount: 1500,
    });
  });

  it('adds up several repayments of the same pair', () => {
    const plan = calculateRepaymentPlan({
      ...data,
      paidRepayments: [
        { fromUserId: 'alice', toUserId: 'charles', amount: 1000 },
        { fromUserId: 'alice', toUserId: 'charles', amount: 2000 },
      ],
    });

    expect(plan[0].remainingAmount).toBe(2000);
  });
});
