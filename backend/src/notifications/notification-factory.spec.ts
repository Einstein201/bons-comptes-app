import { describe, expect, it, vi } from 'vitest';
import {
  formatEuros,
  notifyInvitationReceived,
  notifyRepaymentConfirmed,
} from './notification-factory.js';

function createTransaction() {
  return {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'Alice' }),
      findMany: vi.fn().mockResolvedValue([
        { id: 'bob', name: 'Bob' },
        { id: 'carol', name: 'Carol' },
      ]),
    },
    notification: { create: vi.fn(), createMany: vi.fn() },
  };
}

describe('formatEuros', () => {
  it.each([
    [2000, '20 €'],
    [550, '5,50 €'],
    [5, '0,05 €'],
    [123456, '1234,56 €'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatEuros(cents)).toBe(expected);
  });
});

describe('notifyInvitationReceived', () => {
  it('notifies the invitee with the inviter name and the wallet title', async () => {
    const transaction = createTransaction();

    await notifyInvitationReceived(transaction as never, {
      inviteeId: 'bob',
      inviterId: 'alice',
      walletId: 'wallet-1',
      walletTitle: 'Voyage à Paris',
    });

    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'bob',
        type: 'INVITATION_RECEIVED',
        message: 'Alice vous a invité à Voyage à Paris',
        walletId: 'wallet-1',
      },
    });
  });
});

describe('notifyRepaymentConfirmed', () => {
  const confirmation = {
    walletId: 'wallet-1',
    fromUserId: 'bob',
    toUserId: 'carol',
    amount: 2000,
  };

  it('notifies the debtor and the recipient when a third party confirms', async () => {
    const transaction = createTransaction();

    await notifyRepaymentConfirmed(transaction as never, {
      ...confirmation,
      actorId: 'alice',
    });

    expect(transaction.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'bob',
          type: 'REPAYMENT_CONFIRMED',
          message: 'Votre remboursement de 20 € à Carol a été confirmé',
          walletId: 'wallet-1',
        },
        {
          userId: 'carol',
          type: 'REPAYMENT_CONFIRMED',
          message: 'Bob a réglé sa dette de 20 €',
          walletId: 'wallet-1',
        },
      ],
    });
  });

  it('does not notify the person who confirmed', async () => {
    const transaction = createTransaction();

    await notifyRepaymentConfirmed(transaction as never, {
      ...confirmation,
      actorId: 'carol',
    });

    const { data } = transaction.notification.createMany.mock.calls[0][0];
    expect(data.map(({ userId }: { userId: string }) => userId)).toEqual([
      'bob',
    ]);
  });

  it('creates nothing when the only person to notify is the actor', async () => {
    const transaction = createTransaction();

    await notifyRepaymentConfirmed(transaction as never, {
      ...confirmation,
      toUserId: 'bob',
      actorId: 'bob',
    });

    expect(transaction.notification.createMany).not.toHaveBeenCalled();
  });
});
