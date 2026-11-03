import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor } from '../wallets/wallet-pagination.js';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';

const notificationSelect = {
  id: true,
  type: true,
  message: true,
  walletId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

// Toutes les requêtes filtrent sur userId : un utilisateur ne voit et ne modifie que ses notifications.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListNotificationsQueryDto) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    // Le curseur contient createdAt et id de la dernière ligne : la page suivante
    // reprend juste après, dans le même ordre (createdAt puis id décroissants).
    const afterCursor = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.date } },
            { createdAt: cursor.date, id: { lt: cursor.id } },
          ],
        }
      : {};

    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...afterCursor },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: notificationSelect,
      }),
      // Compteur global (pastille de la cloche), indépendant de la page demandée.
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    const hasNextPage = notifications.length > query.limit;
    const items = notifications.slice(0, query.limit);
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasNextPage ? encodeCursor(last.createdAt, last.id) : null,
      unreadCount,
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    // Une notification d'un autre utilisateur est indiscernable d'une notification absente.
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: notificationSelect,
    });

    if (!notification) {
      throw new NotFoundException('Notification introuvable.');
    }

    if (notification.readAt) {
      return notification;
    }

    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return this.prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
      select: notificationSelect,
    });
  }

  async markAllAsRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: count };
  }
}
