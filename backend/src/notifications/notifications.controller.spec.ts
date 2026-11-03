import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: {
    list: Mock;
    markAsRead: Mock;
    markAllAsRead: Mock;
  };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    notificationsService = {
      list: vi.fn().mockResolvedValue({ items: [] }),
      markAsRead: vi.fn().mockResolvedValue({ id: 'notification-1' }),
      markAllAsRead: vi.fn().mockResolvedValue({ updated: 2 }),
    };
    controller = new NotificationsController(
      notificationsService as unknown as NotificationsService,
    );
  });

  it('lists the notifications of the authenticated user', async () => {
    const query = new ListNotificationsQueryDto();

    await controller.list(request, query);

    expect(notificationsService.list).toHaveBeenCalledWith('user-123', query);
  });

  it('marks a notification as read for the authenticated user', async () => {
    await controller.markAsRead('notification-1', request);

    expect(notificationsService.markAsRead).toHaveBeenCalledWith(
      'notification-1',
      'user-123',
    );
  });

  it('marks all notifications as read for the authenticated user', async () => {
    await expect(controller.markAllAsRead(request)).resolves.toEqual({
      updated: 2,
    });

    expect(notificationsService.markAllAsRead).toHaveBeenCalledWith('user-123');
  });
});
