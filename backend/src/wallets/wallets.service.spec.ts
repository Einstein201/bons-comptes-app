import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { encodeCursor } from './wallet-pagination.js';
import { WalletsService } from './wallets.service.js';

describe('WalletsService', () => {
  let walletsService: WalletsService;
  let prisma: {
    $transaction: Mock;
    wallet: { findMany: Mock; count: Mock };
    walletMember: { findMany: Mock; count: Mock };
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
      wallet: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      walletMember: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
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
      updatedAt: true,
      closedAt: true,
      createdById: true,
      createdBy: { select: { name: true } },
    };
    // Ligne telle que la renvoie Prisma (avec le créateur) et élément tel que l'API l'expose.
    const wallet = (
      id: string,
      createdAt: string,
      status = 'OPEN',
      createdById = 'creator-1',
    ) => ({
      id,
      title: `Wallet ${id}`,
      description: null,
      status,
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
      closedAt: null,
      createdById,
      createdBy: { name: 'Élodie Laurent' },
    });
    const exposed = (row: ReturnType<typeof wallet>, isCreator = false) => {
      const { createdById: _createdById, createdBy, ...fields } = row;
      return { ...fields, creatorName: createdBy.name, isCreator };
    };

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
          open: { items: [], nextCursor: null, total: 0 },
          closed: { items: [], nextCursor: null, total: 0 },
          invitations: { items: [], nextCursor: null, total: 0 },
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
        {
          ...exposed(wallet('invited-1', '2026-10-03T00:00:00.000Z')),
          invitedAt,
        },
      ]);
      expect(result.invitations.items[0]).not.toHaveProperty('membership');
    });

    it('tells whether the caller created each wallet and names its creator, without exposing identifiers', async () => {
      prisma.wallet.findMany.mockImplementation(async ({ where }) =>
        where.status === 'OPEN'
          ? [
              wallet('mine', '2026-10-02T00:00:00.000Z', 'OPEN', 'user-123'),
              wallet('theirs', '2026-10-01T00:00:00.000Z', 'OPEN', 'user-456'),
            ]
          : [],
      );
      prisma.walletMember.findMany.mockResolvedValue([
        {
          id: 'membership-1',
          invitedAt: new Date('2026-10-20T08:00:00.000Z'),
          wallet: wallet(
            'invited',
            '2026-10-03T00:00:00.000Z',
            'OPEN',
            'user-456',
          ),
        },
      ]);

      const { open, invitations } = await walletsService.listForUser(
        'user-123',
        {},
      );

      expect(open.items.map(({ id, isCreator }) => [id, isCreator])).toEqual([
        ['mine', true],
        ['theirs', false],
      ]);
      expect(open.items[0].creatorName).toBe('Élodie Laurent');
      expect(invitations.items[0].isCreator).toBe(false);
      for (const item of [...open.items, ...invitations.items]) {
        expect(item).not.toHaveProperty('createdById');
        expect(item).not.toHaveProperty('createdBy');
      }
    });

    it('counts each section on its own filter, whatever the limit and the cursors', async () => {
      prisma.wallet.count.mockImplementation(async ({ where }) =>
        where.status === 'OPEN' ? 42 : 7,
      );
      prisma.walletMember.count.mockResolvedValue(3);
      const date = new Date('2026-10-02T00:00:00.000Z');

      const result = await walletsService.listForUser('user-123', {
        limit: 2,
        openCursor: encodeCursor(date, 'w-2'),
        invitationsCursor: encodeCursor(date, 'm-2'),
      });

      expect(result.open.total).toBe(42);
      expect(result.closed.total).toBe(7);
      expect(result.invitations.total).toBe(3);
      for (const status of ['OPEN', 'CLOSED']) {
        expect(prisma.wallet.count).toHaveBeenCalledWith({
          where: {
            status,
            members: { some: { userId: 'user-123', status: 'MEMBER' } },
          },
        });
      }
      expect(prisma.walletMember.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'INVITED',
          wallet: { status: 'OPEN' },
        },
      });
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
      expect(prisma.wallet.count).not.toHaveBeenCalled();
      expect(prisma.walletMember.count).not.toHaveBeenCalled();
    });
  });
});

describe('WalletsService.findOne', () => {
  let walletsService: WalletsService;
  let prisma: {
    wallet: { findUnique: Mock };
    walletMember: { findUnique: Mock; findMany: Mock };
  };

  const wallet = {
    id: 'wallet-123',
    title: 'Vacances à Montréal',
    description: 'Dépenses du voyage',
    status: 'OPEN',
    createdAt: new Date('2026-10-25T12:00:00.000Z'),
  };

  function createMembership(id: string, userId: string, status: string) {
    return {
      id,
      status,
      invitedAt: new Date('2026-10-25T12:00:00.000Z'),
      acceptedAt:
        status === 'MEMBER' ? new Date('2026-10-25T12:05:00.000Z') : null,
      user: {
        id: userId,
        name: `Nom ${userId}`,
        email: `${userId}@example.com`,
      },
    };
  }

  beforeEach(() => {
    prisma = {
      wallet: { findUnique: vi.fn() },
      walletMember: { findUnique: vi.fn(), findMany: vi.fn() },
    };
    walletsService = new WalletsService(prisma as unknown as PrismaService);
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(
      walletsService.findOne('unknown', 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.walletMember.findMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is not a member', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue(null);

    await expect(
      walletsService.findOne(wallet.id, 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.walletMember.findMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is only invited', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'INVITED' });

    await expect(
      walletsService.findOne(wallet.id, 'user-1', { limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.walletMember.findMany).not.toHaveBeenCalled();
  });

  it('returns the wallet and the members with their status', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([
      createMembership('m-1', 'user-1', 'MEMBER'),
      createMembership('m-2', 'user-2', 'INVITED'),
    ]);

    const result = await walletsService.findOne(wallet.id, 'user-1', {
      limit: 20,
    });

    expect(result).toEqual({
      wallet,
      members: {
        items: [
          {
            userId: 'user-1',
            name: 'Nom user-1',
            email: 'user-1@example.com',
            status: 'MEMBER',
            invitedAt: new Date('2026-10-25T12:00:00.000Z'),
            acceptedAt: new Date('2026-10-25T12:05:00.000Z'),
          },
          {
            userId: 'user-2',
            name: 'Nom user-2',
            email: 'user-2@example.com',
            status: 'INVITED',
            invitedAt: new Date('2026-10-25T12:00:00.000Z'),
            acceptedAt: null,
          },
        ],
        nextCursor: null,
      },
    });
  });

  it('checks the membership of the authenticated user', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([]);

    await walletsService.findOne(wallet.id, 'user-1', { limit: 20 });

    expect(prisma.walletMember.findUnique).toHaveBeenCalledWith({
      where: { walletId_userId: { walletId: wallet.id, userId: 'user-1' } },
      select: { status: true },
    });
  });

  it('fetches one page in a single sorted query', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([]);

    await walletsService.findOne(wallet.id, 'user-1', {
      limit: 20,
      cursor: 'm-5',
    });

    expect(prisma.walletMember.findMany).toHaveBeenCalledOnce();
    expect(prisma.walletMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: wallet.id },
        orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }],
        take: 21,
        cursor: { id: 'm-5' },
        skip: 1,
      }),
    );
  });

  it('returns a nextCursor when there are more members than the limit', async () => {
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    prisma.walletMember.findUnique.mockResolvedValue({ status: 'MEMBER' });
    prisma.walletMember.findMany.mockResolvedValue([
      createMembership('m-1', 'user-1', 'MEMBER'),
      createMembership('m-2', 'user-2', 'MEMBER'),
      createMembership('m-3', 'user-3', 'INVITED'),
    ]);

    const result = await walletsService.findOne(wallet.id, 'user-1', {
      limit: 2,
    });

    expect(result.members.items).toHaveLength(2);
    expect(result.members.nextCursor).toBe('m-2');
  });
});