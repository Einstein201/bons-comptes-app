// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import type { Notification, NotificationPage } from '../services/notifications';
import { NotificationBell } from './NotificationBell';

const mocks = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../services/notifications', () => ({
  getNotifications: mocks.getNotifications,
  markNotificationRead: mocks.markNotificationRead,
  markAllNotificationsRead: mocks.markAllNotificationsRead,
}));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const invitation: Notification = {
  id: 'n-invitation',
  type: 'INVITATION_RECEIVED',
  message: 'Alice vous a invité à Voyage à Paris',
  walletId: 'wallet-1',
  readAt: null,
  createdAt: minutesAgo(5),
};
const repayment: Notification = {
  id: 'n-repayment',
  type: 'REPAYMENT_CONFIRMED',
  message: 'Bob a réglé sa dette de 20 €',
  walletId: 'wallet-2',
  readAt: minutesAgo(1),
  createdAt: minutesAgo(26 * 60),
};

function page(items: Notification[], unreadCount: number): NotificationPage {
  return { items, nextCursor: null, unreadCount };
}

function bell(name: RegExp | string = /^Notifications/) {
  return screen.getByRole('button', { name });
}

async function renderBell() {
  render(<NotificationBell />);
  // Laisse l'appel initial se terminer.
  await act(async () => {});
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.getNotifications.mockReset();
  mocks.markNotificationRead.mockReset();
  mocks.markAllNotificationsRead.mockReset();
  mocks.push.mockReset();
  mocks.getNotifications.mockResolvedValue(page([invitation, repayment], 1));
  mocks.markNotificationRead.mockResolvedValue({ ...invitation, readAt: minutesAgo(0) });
  mocks.markAllNotificationsRead.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('pastille de non-lues', () => {
  it('reflète le nombre de notifications non lues', async () => {
    mocks.getNotifications.mockResolvedValue(page([invitation], 3));
    await renderBell();

    expect(bell('Notifications, 3 non lues')).toBeTruthy();
    expect(bell().textContent).toBe('3');
  });

  it('accorde le libellé au singulier', async () => {
    await renderBell();

    expect(bell('Notifications, 1 non lue')).toBeTruthy();
  });

  it('plafonne l’affichage à 9+', async () => {
    mocks.getNotifications.mockResolvedValue(page([invitation], 42));
    await renderBell();

    expect(bell().textContent).toBe('9+');
    expect(bell('Notifications, 42 non lues')).toBeTruthy();
  });

  it('n’affiche aucune pastille quand tout est lu', async () => {
    mocks.getNotifications.mockResolvedValue(page([repayment], 0));
    await renderBell();

    expect(bell('Notifications').textContent).toBe('');
  });
});

describe('menu', () => {
  it('affiche le message et la date relative de chaque notification', async () => {
    await renderBell();
    fireEvent.click(bell());

    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/Alice vous a invité à Voyage à Paris/)).toBeTruthy();
    expect(screen.getByText('Il y a 5 min')).toBeTruthy();
    expect(screen.getByText('Bob a réglé sa dette de 20 €')).toBeTruthy();
    expect(screen.getByText('Hier')).toBeTruthy();
    expect(bell().getAttribute('aria-expanded')).toBe('true');
  });

  it('signale aux lecteurs d’écran les notifications non lues', async () => {
    await renderBell();
    fireEvent.click(bell());

    expect(screen.getByText('Non lue :')).toBeTruthy();
    expect(screen.getAllByText(/Non lue/)).toHaveLength(1);
  });

  it('place le focus sur la première notification à l’ouverture', async () => {
    await renderBell();
    fireEvent.click(bell());

    const first = screen.getAllByRole('button', { name: /Alice vous a invité/ })[0];
    expect(document.activeElement).toBe(first);
  });

  it('affiche l’état vide', async () => {
    mocks.getNotifications.mockResolvedValue(page([], 0));
    await renderBell();
    fireEvent.click(bell());

    expect(screen.getByText('Vous êtes à jour !')).toBeTruthy();
    expect(screen.getByText('Aucune notification pour le moment.')).toBeTruthy();
  });

  it('actualise la liste à l’ouverture', async () => {
    await renderBell();
    mocks.getNotifications.mockResolvedValue(page([repayment], 0));

    fireEvent.click(bell());

    await waitFor(() => expect(screen.queryByText(/Alice vous a invité/)).toBeNull());
    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
  });
});

describe('notification automatique', () => {
  it('affiche un toast pour les notifications non lues dès le chargement', async () => {
    await renderBell();

    expect(screen.getByRole('status').textContent).toContain(invitation.message);
  });

  it('ouvre le panneau depuis le toast', async () => {
    await renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les notifications' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeTruthy();
  });

  it('ne réaffiche pas les mêmes notifications après un changement de page', async () => {
    await renderBell();
    expect(screen.getByRole('status').textContent).toContain(invitation.message);
    cleanup();

    await renderBell();

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('masque automatiquement le toast après quelques secondes', async () => {
    vi.useFakeTimers();
    await renderBell();
    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('accessibilité', () => {
  it('se ferme avec Échap et rend le focus à la cloche', async () => {
    await renderBell();
    fireEvent.click(bell());

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bell().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(bell());
  });

  it('se ferme au clic en dehors du menu', async () => {
    await renderBell();
    fireEvent.click(bell());

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('se ferme quand le focus quitte le composant', async () => {
    render(
      <>
        <NotificationBell />
        <button type="button">Ailleurs</button>
      </>,
    );
    await act(async () => {});
    fireEvent.click(bell());

    act(() => screen.getByRole('button', { name: 'Ailleurs' }).focus());

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reste ouvert quand le focus reste dans le menu', async () => {
    await renderBell();
    fireEvent.click(bell());

    act(() => screen.getByRole('button', { name: 'Tout marquer comme lu' }).focus());

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('referme le menu avec un second clic sur la cloche', async () => {
    await renderBell();
    fireEvent.click(bell());
    fireEvent.click(bell());

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('clic sur une notification', () => {
  it('marque l’invitation comme lue et ouvre les invitations', async () => {
    await renderBell();
    fireEvent.click(bell());

    fireEvent.click(screen.getByRole('button', { name: /Alice vous a invité/ }));

    expect(mocks.markNotificationRead).toHaveBeenCalledWith('n-invitation');
    expect(mocks.push).toHaveBeenCalledWith('/invitations');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bell('Notifications').textContent).toBe('');
  });

  it('ouvre le porte-monnaie d’un remboursement sans re-marquer une notification déjà lue', async () => {
    await renderBell();
    fireEvent.click(bell());

    fireEvent.click(screen.getByRole('button', { name: /Bob a réglé/ }));

    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith('/wallets/wallet-2');
  });

  it('ne navigue pas quand le porte-monnaie n’est plus connu', async () => {
    mocks.getNotifications.mockResolvedValue(
      page([{ ...repayment, walletId: null, readAt: null }], 1),
    );
    await renderBell();
    fireEvent.click(bell());

    fireEvent.click(screen.getByRole('button', { name: /Bob a réglé/ }));

    expect(mocks.markNotificationRead).toHaveBeenCalledWith('n-repayment');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('resynchronise avec le serveur si le marquage échoue', async () => {
    mocks.markNotificationRead.mockRejectedValue(new ApiError(500));
    await renderBell();
    fireEvent.click(bell());

    fireEvent.click(screen.getByRole('button', { name: /Alice vous a invité/ }));

    await waitFor(() => expect(mocks.getNotifications).toHaveBeenCalledTimes(3));
    expect(mocks.push).toHaveBeenCalledWith('/invitations');
  });
});

describe('Tout marquer comme lu', () => {
  it('marque toutes les notifications comme lues', async () => {
    await renderBell();
    fireEvent.click(bell());

    fireEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));

    expect(mocks.markAllNotificationsRead).toHaveBeenCalledOnce();
    expect(bell('Notifications').textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).toBeNull();
    expect(screen.queryByText(/Non lue/)).toBeNull();
  });

  it('n’est proposé que s’il reste des notifications non lues', async () => {
    mocks.getNotifications.mockResolvedValue(page([repayment], 0));
    await renderBell();
    fireEvent.click(bell());

    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).toBeNull();
  });
});

describe('erreurs', () => {
  it('signale l’échec du chargement et permet de réessayer', async () => {
    mocks.getNotifications.mockRejectedValue(new ApiError(500));
    await renderBell();
    fireEvent.click(bell());

    expect(await screen.findByText('Impossible de charger les notifications.')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();

    mocks.getNotifications.mockResolvedValue(page([invitation], 1));
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText(/Alice vous a invité/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('garde les notifications affichées quand une actualisation échoue', async () => {
    await renderBell();
    mocks.getNotifications.mockRejectedValue(new ApiError(500));

    fireEvent.click(bell());
    await act(async () => {});

    expect(screen.getByText(/Alice vous a invité/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('actualisation périodique', () => {
  it('met à jour la pastille toutes les 30 secondes', async () => {
    vi.useFakeTimers();
    await renderBell();
    expect(bell().textContent).toBe('1');

    mocks.getNotifications.mockResolvedValue(page([invitation], 4));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
    expect(bell().textContent).toBe('4');
  });

  it('arrête d’interroger le serveur quand le composant disparaît', async () => {
    vi.useFakeTimers();
    await renderBell();
    cleanup();

    await vi.advanceTimersByTimeAsync(120_000);

    expect(mocks.getNotifications).toHaveBeenCalledTimes(1);
  });
});
