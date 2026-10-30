import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { encodeCursor } from '../wallets/wallet-pagination.js';
import { RepaymentsService } from './repayments.service.js';

// debtor rembourse recipient ; creator a créé le porte-monnaie ; other est un simple membre.
function repaymentRow(id: string, status: string) {
  return {
    id,
    fromUser: { id: 'debtor', name: 'Bob' },
    toUser: { id: 'recipient', name: 'Alice' },
    amount: 1000,
    status,
    createdAt: new Date('2026-10-28T09:00:00.000Z'),
    paidAt: null,
  };
}

describe('RepaymentsService.findAll', () => {
  let repaymentsService: RepaymentsService;
  let prisma: {
    wallet: { findUnique: Mock };
    walletMember: { findUnique: Mock };
    repayment: { findMany: Mock };
  };

  const query = { limit: 20 };

  beforeEach(() => {
    prisma = {
      wallet: {
        findUnique: vi.fn().mockResolvedValue({ createdById: 'creator' }),
      },
      walletMember: {
        findUnique: vi.fn().mockResolvedValue({ status: 'MEMBER' }),
      },
      repayment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            repaymentRow('r3', 'PENDING'),
            repaymentRow('r2', 'PAID'),
            repaymentRow('r1', 'CANCELLED'),
          ]),
      },
    };
    repaymentsService = new RepaymentsService(
      prisma as unknown as PrismaService,
    );
  });

  async function actionsOf(userId: string) {
    const { items } = await repaymentsService.findAll(
      'wallet-1',
      userId,
      query,
    );

    return items.map((item) => [item.status, item.canConfirm, item.canCancel]);
  }

  describe('actions of each user', () => {
    it('lets the sender cancel a pending repayment, not confirm it', async () => {
      expect(await actionsOf('debtor')).toEqual([
        ['PENDING', false, true],
        ['PAID', false, false],
        ['CANCELLED', false, false],
      ]);
    });

    it('lets the recipient confirm a pending repayment, not cancel it', async () => {
      expect(await actionsOf('recipient')).toEqual([
        ['PENDING', true, false],
        ['PAID', false, false],
        ['CANCELLED', false, false],
      ]);
    });

    it('lets the creator confirm a pending repayment of other members', async () => {
      expect(await actionsOf('creator')).toEqual([
        ['PENDING', true, false],
        ['PAID', false, false],
        ['CANCELLED', false, false],
      ]);
    });

    it('gives no action to another member', async () => {
      expect(await actionsOf('other')).toEqual([
        ['PENDING', false, false],
        ['PAID', false, false],
        ['CANCELLED', false, false],
      ]);
    });
  });

  it('returns the repayments with only the id and name of the users', async () => {
    const { items } = await repaymentsService.findAll(
      'wallet-1',
      'debtor',
      query,
    );

    expect(items[0]).toEqual({
      id: 'r3',
      fromUser: { id: 'debtor', name: 'Bob' },
      toUser: { id: 'recipient', name: 'Alice' },
      amount: 1000,
      status: 'PENDING',
      createdAt: new Date('2026-10-28T09:00:00.000Z'),
      paidAt: null,
      canConfirm: false,
      canCancel: true,
    });
    expect(prisma.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          fromUser: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
        }),
      }),
    );
  });

  it('reads only the wallet of the URL, newest first', async () => {
    await repaymentsService.findAll('wallet-1', 'debtor', query);

    expect(prisma.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: 'wallet-1', status: undefined },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('filters by status', async () => {
    await repaymentsService.findAll('wallet-1', 'debtor', {
      ...query,
      status: 'PAID',
    });

    expect(prisma.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: 'wallet-1', status: 'PAID' },
      }),
    );
  });

  it('returns a cursor with the date and id of the last item when there is a next page', async () => {
    const { items, nextCursor } = await repaymentsService.findAll(
      'wallet-1',
      'debtor',
      { limit: 2 },
    );

    expect(items.map((item) => item.id)).toEqual(['r3', 'r2']);
    expect(nextCursor).toBe(
      encodeCursor(new Date('2026-10-28T09:00:00.000Z'), 'r2'),
    );
  });

  it('returns a null cursor on the last page', async () => {
    const { nextCursor } = await repaymentsService.findAll(
      'wallet-1',
      'debtor',
      query,
    );

    expect(nextCursor).toBeNull();
  });

  it('continues after the cursor, with the id to separate equal dates', async () => {
    const date = new Date('2026-10-28T09:00:00.000Z');

    await repaymentsService.findAll('wallet-1', 'debtor', {
      ...query,
      cursor: encodeCursor(date, 'r2'),
    });

    expect(prisma.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          walletId: 'wallet-1',
          status: undefined,
          OR: [
            { createdAt: { lt: date } },
            { createdAt: date, id: { lt: 'r2' } },
          ],
        },
      }),
    );
  });

  it('throws BadRequestException for an invalid cursor', async () => {
    await expect(
      repaymentsService.findAll('wallet-1', 'debtor', {
        ...query,
        cursor: 'not-a-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(
      repaymentsService.findAll('unknown', 'debtor', query),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['an invited user', { status: 'INVITED' }],
    ['a user who is not in the wallet', null],
  ])('throws ForbiddenException to %s', async (_case, membership) => {
    prisma.walletMember.findUnique.mockResolvedValue(membership);

    await expect(
      repaymentsService.findAll('wallet-1', 'stranger', query),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.repayment.findMany).not.toHaveBeenCalled();
  });
});
