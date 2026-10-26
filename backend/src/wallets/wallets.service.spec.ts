import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { encodeCursor } from './wallet-pagination.js';
import { WalletsService } from './wallets.service.js';

describe('WalletsService', () => {
  let walletsService: WalletsService;
  let prisma: {
    $transaction: Mock;
    wallet: { findMany: Mock };
    walletMember: { findMany: Mock };
  };
  let transaction: {
    wallet: { create: Mock };
    walletMember: { create: Mock };
  };

  beforeEach(() => {
    transaction = {
      wallet: { create: vi.fn() },
      walletMember: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
      wallet: { findMany: vi.fn().mockResolvedValue([]) },
      walletMember: { findMany: vi.fn().mockResolvedValue([]) },
    };
    walletsService = new WalletsService(prisma as unknown as PrismaService);
  });

  it('creates an open wallet and adds its creator as the first member atomically', async () => {
    const createdWallet = {
      id: 'wallet-123',
      title: 'Vacances à Montréal',
      description: 'Dépenses du voyage',
      status: 'OPEN',
      createdAt: new Date(),
    };
    transaction.wallet.create.mockResolvedValue(createdWallet);
    transaction.walletMember.create.mockResolvedValue({ id: 'member-123' });

    await expect(
      walletsService.create(
        {
          title: createdWallet.title,
          description: createdWallet.description,
        },
        'user-123',
      ),
    ).resolves.toEqual(createdWallet);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.wallet.create).toHaveBeenCalledWith({
      data: {
        title: createdWallet.title,
        description: createdWallet.description,
        status: 'OPEN',
        createdById: 'user-123',
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });
    expect(transaction.walletMember.create).toHaveBeenCalledWith({
      data: {
        walletId: createdWallet.id,
        userId: 'user-123',
        status: 'MEMBER',
        acceptedAt: expect.any(Date),
      },
    });
  });

  it('rolls back when adding the first member fails', async () => {
    const transactionError = new Error('member creation failed');
    transaction.wallet.create.mockResolvedValue({ id: 'wallet-123' });
    transaction.walletMember.create.mockRejectedValue(transactionError);

    await expect(
      walletsService.create({ title: 'Wallet' }, 'user-123'),
    ).rejects.toBe(transactionError);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  describe('listForUser', () => {
    const walletSelect = {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      closedAt: true,
    };
    const wallet = (id: string, createdAt: string, status = 'OPEN') => ({
      id,
      title: `Wallet ${id}`,
      description: null,
      status,
      createdAt: new Date(createdAt),
      closedAt: null,
    });

    it('queries each section with the given user and the default limit of 20', async () => {
      await walletsService.listForUser('user-123', {});

      expect(prisma.wallet.findMany).toHaveBeenCalledTimes(2);
      for (const status of ['OPEN', 'CLOSED']) {
        expect(prisma.wallet.findMany).toHaveBeenCalledWith({
          where: {
            status,
            members: { some: { userId: 'user-123', status: 'MEMBER' } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 21,
          select: walletSelect,
        });
      }
      expect(prisma.walletMember.findMany).toHaveBeenCalledOnce();
      expect(prisma.walletMember.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'INVITED',
          wallet: { status: 'OPEN' },
        },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
        take: 21,
        select: { id: true, invitedAt: true, wallet: { select: walletSelect } },
      });
    });

    it('returns three empty sections when nothing is found', async () => {
      await expect(walletsService.listForUser('user-123', {})).resolves.toEqual(
        {
          open: { items: [], nextCursor: null },
          closed: { items: [], nextCursor: null },
          invitations: { items: [], nextCursor: null },
        },
      );
    });

    it('keeps the sections apart and returns invitations as a wallet with its invitedAt', async () => {
      const invitedAt = new Date('2026-10-20T08:00:00.000Z');
      prisma.wallet.findMany.mockImplementation(async ({ where }) =>
        where.status === 'OPEN'
          ? [wallet('open-1', '2026-10-02T00:00:00.000Z')]
          : [wallet('closed-1', '2026-10-01T00:00:00.000Z', 'CLOSED')],
      );
      prisma.walletMember.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          invitedAt,
          wallet: wallet('invited-1', '2026-10-03T00:00:00.000Z'),
        },
      ]);

      const result = await walletsService.listForUser('user-123', {});

      expect(result.open.items.map((item) => item.id)).toEqual(['open-1']);
      expect(result.closed.items.map((item) => item.id)).toEqual(['closed-1']);
      expect(result.invitations.items).toEqual([
        { ...wallet('invited-1', '2026-10-03T00:00:00.000Z'), invitedAt },
      ]);
      expect(result.invitations.items[0]).not.toHaveProperty('membership');
    });

    it('applies the requested limit and exposes a cursor when another page exists', async () => {
      const rows = [
        wallet('w-3', '2026-10-03T00:00:00.000Z'),
        wallet('w-2', '2026-10-02T00:00:00.000Z'),
        wallet('w-1', '2026-10-01T00:00:00.000Z'),
      ];
      prisma.wallet.findMany.mockImplementation(async ({ where }) =>
        where.status === 'OPEN' ? rows : [],
      );

      const result = await walletsService.listForUser('user-123', {
        limit: 2,
      });

      expect(prisma.wallet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
      expect(result.open.items.map((item) => item.id)).toEqual(['w-3', 'w-2']);
      expect(result.open.nextCursor).toBe(
        encodeCursor(rows[1].createdAt, 'w-2'),
      );
      expect(result.closed.nextCursor).toBeNull();
    });

    it('builds the invitation cursor from invitedAt and the membership identifier', async () => {
      const memberships = ['m-3', 'm-2', 'm-1'].map((id, index) => ({
        id,
        invitedAt: new Date(Date.UTC(2026, 9, 3 - index)),
        wallet: wallet(`wallet-of-${id}`, '2026-10-01T00:00:00.000Z'),
      }));
      prisma.walletMember.findMany.mockResolvedValue(memberships);

      const result = await walletsService.listForUser('user-123', {
        limit: 2,
      });

      expect(result.invitations.items).toHaveLength(2);
      expect(result.invitations.nextCursor).toBe(
        encodeCursor(memberships[1].invitedAt, 'm-2'),
      );
    });

    it('resumes each section after its own cursor only', async () => {
      const date = new Date('2026-10-02T00:00:00.000Z');

      await walletsService.listForUser('user-123', {
        openCursor: encodeCursor(date, 'w-2'),
      });

      const [open, closed] = ['OPEN', 'CLOSED'].map(
        (status) =>
          prisma.wallet.findMany.mock.calls.find(
            ([args]) => args.where.status === status,
          )![0],
      );
      expect(open.where.OR).toEqual([
        { createdAt: { lt: date } },
        { createdAt: date, id: { lt: 'w-2' } },
      ]);
      expect(closed.where).not.toHaveProperty('OR');
      expect(
        prisma.walletMember.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('OR');
    });

    it('resumes invitations on invitedAt, not on the wallet date', async () => {
      const date = new Date('2026-10-05T00:00:00.000Z');

      await walletsService.listForUser('user-123', {
        invitationsCursor: encodeCursor(date, 'm-2'),
      });

      expect(prisma.walletMember.findMany.mock.calls[0][0].where.OR).toEqual([
        { invitedAt: { lt: date } },
        { invitedAt: date, id: { lt: 'm-2' } },
      ]);
    });

    it('rejects an invalid cursor before querying the database', async () => {
      await expect(
        walletsService.listForUser('user-123', { closedCursor: 'garbage' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.wallet.findMany).not.toHaveBeenCalled();
      expect(prisma.walletMember.findMany).not.toHaveBeenCalled();
    });
  });
});
