import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { encodeCursor } from '../wallets/wallet-pagination.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      findMany: Mock;
      findFirst: Mock;
      findUniqueOrThrow: Mock;
      updateMany: Mock;
      count: Mock;
    };
  };

  const query = (overrides: Partial<ListNotificationsQueryDto> = {}) =>
    Object.assign(new ListNotificationsQueryDto(), overrides);

  const row = (id: string, createdAt: string, readAt: Date | null = null) => ({
    id,
    type: 'INVITATION_RECEIVED',
    message: 'Alice vous a invité à Voyage',
    walletId: 'wallet-1',
    readAt,
    createdAt: new Date(createdAt),
  });

  beforeEach(() => {
    prisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('only reads the notifications of the authenticated user, newest first', async () => {
      await service.list('user-1', query({ limit: 10 }));

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 11,
        }),
      );
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });

    it('returns the unread count and a cursor when more pages exist', async () => {
      prisma.notification.count.mockResolvedValue(7);
      prisma.notification.findMany.mockResolvedValue([
        row('n3', '2026-11-03T10:03:00.000Z'),
        row('n2', '2026-11-03T10:02:00.000Z'),
        row('n1', '2026-11-03T10:01:00.000Z'),
      ]);

      const result = await service.list('user-1', query({ limit: 2 }));

      expect(result.items.map(({ id }) => id)).toEqual(['n3', 'n2']);
      expect(result.unreadCount).toBe(7);
      expect(result.nextCursor).toBe(
        encodeCursor(new Date('2026-11-03T10:02:00.000Z'), 'n2'),
      );
    });

    it('returns no cursor on the last page', async () => {
      prisma.notification.findMany.mockResolvedValue([
        row('n1', '2026-11-03T10:01:00.000Z'),
      ]);

      const result = await service.list('user-1', query({ limit: 2 }));

      expect(result.nextCursor).toBeNull();
    });

    it('resumes after the cursor in the same order', async () => {
      const date = new Date('2026-11-03T10:02:00.000Z');

      await service.list(
        'user-1',
        query({ limit: 2, cursor: encodeCursor(date, 'n2') }),
      );

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            OR: [
              { createdAt: { lt: date } },
              { createdAt: date, id: { lt: 'n2' } },
            ],
          },
        }),
      );
    });

    it('rejects an invalid cursor', async () => {
      await expect(
        service.list('user-1', query({ cursor: 'not-a-cursor' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('refuses a notification that belongs to someone else as not found', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(
        service.markAsRead('notification-1', 'intruder'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.notification.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notification-1', userId: 'intruder' },
        }),
      );
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });

    it('sets readAt on an unread notification of the user', async () => {
      const unread = row('notification-1', '2026-11-03T10:00:00.000Z');
      const read = { ...unread, readAt: new Date() };
      prisma.notification.findFirst.mockResolvedValue(unread);
      prisma.notification.findUniqueOrThrow.mockResolvedValue(read);

      await expect(
        service.markAsRead('notification-1', 'user-1'),
      ).resolves.toEqual(read);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notification-1', userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('keeps the original readAt of an already read notification', async () => {
      const alreadyRead = row(
        'notification-1',
        '2026-11-03T10:00:00.000Z',
        new Date('2026-11-03T11:00:00.000Z'),
      );
      prisma.notification.findFirst.mockResolvedValue(alreadyRead);

      await expect(
        service.markAsRead('notification-1', 'user-1'),
      ).resolves.toEqual(alreadyRead);

      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('only updates the unread notifications of the authenticated user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });

      await expect(service.markAllAsRead('user-1')).resolves.toEqual({
        updated: 4,
      });

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
