// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import type { WalletListItem, WalletLists, WalletPage } from '../services/wallets';
import { WalletDashboard } from './WalletDashboard';

const mocks = vi.hoisted(() => ({ listWallets: vi.fn() }));

vi.mock('../services/wallets', () => ({ listWallets: mocks.listWallets }));

function wallet(id: string, overrides: Partial<WalletListItem> = {}): WalletListItem {
  return {
    id,
    title: `Porte-monnaie ${id}`,
    description: null,
    status: 'OPEN',
    createdAt: '2025-06-01T10:00:00.000Z',
    updatedAt: '2025-06-21T10:00:00.000Z',
    closedAt: null,
    creatorName: 'Élodie Laurent',
    isCreator: false,
    ...overrides,
  };
}

function page(items: WalletListItem[], total = items.length, nextCursor: string | null = null) {
  return { items, nextCursor, total } as WalletPage;
}

function lists(overrides: Partial<Record<keyof WalletLists, WalletPage>> = {}): WalletLists {
  return {
    open: page([]),
    closed: page([]),
    invitations: page([]),
    ...overrides,
  } as WalletLists;
}

describe('tableau de bord', () => {
  beforeEach(() => {
    mocks.listWallets.mockReset();
  });
  afterEach(cleanup);

  it('affiche les porte-monnaie ouverts avec leur créateur et les compteurs', async () => {
    mocks.listWallets.mockResolvedValue(
      lists({
        open: page([wallet('a'), wallet('b', { isCreator: true, title: 'Dépenses' })]),
        closed: page([wallet('c')], 3),
        invitations: page([wallet('d')], 2),
      }),
    );
    render(<WalletDashboard />);

    expect(await screen.findByText('Porte-monnaie a')).toBeTruthy();
    expect(screen.getByText('Vous')).toBeTruthy();
    expect(screen.getByText('Élodie Laurent')).toBeTruthy();
    expect(screen.getAllByText(/Mis à jour le 21 juin 2025/)).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Porte-monnaie a/ }).getAttribute('href')).toBe(
      '/wallets/a',
    );
    expect(screen.getByRole('tab', { name: /Ouverts/ }).textContent).toContain('2');
    expect(screen.getByRole('tab', { name: /Clos/ }).textContent).toContain('3');
    expect(screen.getByRole('tab', { name: /Invitations/ }).textContent).toContain('2');
  });

  it('affiche les sections clos et invitations dans leur onglet', async () => {
    mocks.listWallets.mockResolvedValue(
      lists({
        closed: page([wallet('c', { status: 'CLOSED', closedAt: '2025-05-02T10:00:00.000Z' })]),
        invitations: page([wallet('d', { creatorName: 'Alice' })]),
      }),
    );
    render(<WalletDashboard />);

    fireEvent.click(await screen.findByRole('tab', { name: /Clos/ }));
    expect(await screen.findByText(/Clos le 2 mai 2025/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Invitations/ }));
    expect(await screen.findByText('Invité par Alice')).toBeTruthy();
    expect(screen.queryByText('Porte-monnaie c')).toBeNull();
  });

  it('affiche un état vide explicite pour chaque section', async () => {
    mocks.listWallets.mockResolvedValue(lists());
    render(<WalletDashboard />);

    expect(await screen.findByText('Aucun porte-monnaie pour le moment')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Créer un porte-monnaie/ }).getAttribute('href')).toBe(
      '/wallets/new',
    );

    fireEvent.click(screen.getByRole('tab', { name: /Clos/ }));
    expect(screen.getByText('Aucun porte-monnaie clos')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Invitations/ }));
    expect(screen.getByText('Aucune invitation en attente')).toBeTruthy();
  });

  it('pagine chaque section avec son propre curseur', async () => {
    mocks.listWallets.mockImplementation(async ({ section, cursor }: { section: string; cursor?: string }) => {
      if (section === 'open' && cursor === 'cursor-open') {
        return lists({ open: page([wallet('b')], 12) });
      }
      return lists({
        open: page([wallet('a')], 12, 'cursor-open'),
        closed: page([wallet('c')], 1),
      });
    });
    render(<WalletDashboard />);

    expect(await screen.findByText('Porte-monnaie a')).toBeTruthy();
    expect(screen.getByText('Page 1 sur 2')).toBeTruthy();
    const previous = screen.getByRole('button', { name: 'Précédent' }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByText('Porte-monnaie b')).toBeTruthy();
    expect(mocks.listWallets).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'open', cursor: 'cursor-open' }),
    );
    expect(screen.getByText('Page 2 sur 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    // Le changement de page de « Ouverts » ne touche pas la section « Clos ».
    fireEvent.click(screen.getByRole('tab', { name: /Clos/ }));
    expect(screen.getByText('Porte-monnaie c')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Ouverts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(await screen.findByText('Porte-monnaie a')).toBeTruthy();
    expect(screen.getByText('Page 1 sur 2')).toBeTruthy();
  });

  it('affiche une erreur avec un bouton pour réessayer', async () => {
    mocks.listWallets.mockImplementation(() => Promise.reject(new ApiError(500)));
    render(<WalletDashboard />);

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('Le serveur');

    mocks.listWallets.mockResolvedValue(lists({ open: page([wallet('a')]) }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Réessayer' })[0]);
    await waitFor(() => expect(screen.getByText('Porte-monnaie a')).toBeTruthy());
  });

  it('indique le chargement avant la réponse du serveur', () => {
    mocks.listWallets.mockReturnValue(new Promise(() => undefined));
    render(<WalletDashboard />);
    expect(screen.getByRole('status').textContent).toContain('Chargement');
  });
});
