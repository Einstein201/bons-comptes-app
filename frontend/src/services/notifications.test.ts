import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setAccessToken } from './api';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications';

const fetchMock = vi.fn<typeof fetch>();
const notification = {
  id: 'notification-1',
  type: 'INVITATION_RECEIVED',
  message: 'Alice vous a invité à Voyage à Paris',
  walletId: 'wallet-1',
  readAt: null,
  createdAt: '2026-11-03T10:00:00.000Z',
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setAccessToken('access');
});

afterEach(() => {
  setAccessToken(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getNotifications', () => {
  it('charge la liste avec la limite et le curseur', async () => {
    const page = { items: [notification], nextCursor: 'next', unreadCount: 3 };
    fetchMock.mockResolvedValue(Response.json(page));

    await expect(getNotifications({ limit: 10, cursor: 'abc' })).resolves.toEqual(page);

    expect(String(fetchMock.mock.calls[0][0]))
      .toBe('http://localhost:3000/notifications?limit=10&cursor=abc');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(true);
  });

  it('n’ajoute aucun paramètre par défaut', async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [], nextCursor: null, unreadCount: 0 }));

    await getNotifications();

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:3000/notifications');
  });

  it.each([
    { items: [{ ...notification, type: 'OTHER' }], nextCursor: null, unreadCount: 0 },
    { items: [{ ...notification, createdAt: 'hier' }], nextCursor: null, unreadCount: 0 },
    { items: [{ ...notification, readAt: 12 }], nextCursor: null, unreadCount: 0 },
    { items: [], nextCursor: 12, unreadCount: 0 },
    { items: [], nextCursor: null, unreadCount: -1 },
    { items: [], nextCursor: null },
    { items: 'x', nextCursor: null, unreadCount: 0 },
  ])('rejette une liste mal formée (%#)', async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));

    await expect(getNotifications()).rejects.toThrow('invalide');
  });

  it('propage les erreurs de l’API', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'Erreur' }, { status: 500 }));

    await expect(getNotifications()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('markNotificationRead', () => {
  it('marque la notification comme lue', async () => {
    const read = { ...notification, id: 'notification/1', readAt: '2026-11-03T10:05:00.000Z' };
    fetchMock.mockResolvedValue(Response.json(read));

    await expect(markNotificationRead('notification/1')).resolves.toEqual(read);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:3000/notifications/notification%2F1/read');
    expect(init?.method).toBe('POST');
  });

  it('refuse une réponse qui concerne une autre notification', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...notification, id: 'other' }));

    await expect(markNotificationRead('notification-1')).rejects.toThrow('invalide');
  });

  it('propage le 404 d’une notification inconnue', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: 'Introuvable' }, { status: 404 }));

    await expect(markNotificationRead('notification-1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('markAllNotificationsRead', () => {
  it('appelle read-all en POST', async () => {
    fetchMock.mockResolvedValue(Response.json({ updated: 2 }));

    await expect(markAllNotificationsRead()).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:3000/notifications/read-all');
    expect(init?.method).toBe('POST');
  });
});
