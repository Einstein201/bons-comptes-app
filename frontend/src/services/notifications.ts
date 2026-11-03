import { apiRequest } from './api';
import { isDateString, isNonEmptyString, isRecord } from './api-contract';

export type NotificationType = 'INVITATION_RECEIVED' | 'REPAYMENT_CONFIRMED';

export type Notification = {
  id: string;
  type: NotificationType;
  message: string;
  walletId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
};

function isNotification(value: unknown): value is Notification {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    (value.type === 'INVITATION_RECEIVED' || value.type === 'REPAYMENT_CONFIRMED') &&
    typeof value.message === 'string' &&
    (value.walletId === null || isNonEmptyString(value.walletId)) &&
    (value.readAt === null || isDateString(value.readAt)) &&
    isDateString(value.createdAt);
}

function isNotificationPage(value: unknown): value is NotificationPage {
  return isRecord(value) &&
    Array.isArray(value.items) && value.items.every(isNotification) &&
    (value.nextCursor === null || isNonEmptyString(value.nextCursor)) &&
    typeof value.unreadCount === 'number' &&
    Number.isInteger(value.unreadCount) && value.unreadCount >= 0;
}

export async function getNotifications(
  query: { limit?: number; cursor?: string } = {},
): Promise<NotificationPage> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const suffix = params.size ? `?${params}` : '';
  const response = await apiRequest(`/notifications${suffix}`);
  const body: unknown = await response.json();
  if (!isNotificationPage(body)) {
    throw new Error('La réponse de la liste des notifications est invalide.');
  }
  return body;
}

export async function markNotificationRead(notificationId: string): Promise<Notification> {
  const response = await apiRequest(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST' },
  );
  const body: unknown = await response.json();
  if (!isNotification(body) || body.id !== notificationId) {
    throw new Error('La réponse du marquage de la notification est invalide.');
  }
  return body;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest('/notifications/read-all', { method: 'POST' });
}
