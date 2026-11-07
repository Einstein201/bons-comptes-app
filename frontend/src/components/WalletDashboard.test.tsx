// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import type {
  InvitationItem,
  WalletListItem,
  WalletLists,
  WalletPage,
} from '../services/wallets';
import { WalletDashboard } from './WalletDashboard';

const mocks = vi.hoisted(() => ({
  listWallets: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));

vi.mock('../services/wallets', () => ({ listWallets: mocks.listWallets }));
vi.mock('../services/invitations', () => ({
  acceptInvitation: mocks.acceptInvitation,
  declineInvitation: mocks.declineInvitation,
}));

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

function invitation(id: string, overrides: Partial<InvitationItem> = {}): InvitationItem {
  return {
    ...wallet(`wallet-${id}`, { title: `Groupe ${id}` }),
    invitationId: `invitation-${id}`,
    invitedAt: '2025-06-01T10:00:00.000Z',
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
    mocks.acceptInvitation.mockReset();
    mocks.declineInvitation.mockReset();
  });
  afterEach(cleanup);

  it('affiche les porte-monnaie ouverts avec leur créateur et les compteurs', async () => {
    mocks.listWallets.mockResolvedValue(
      lists({
        open: page([wallet('a'), wallet('b', { isCreator: true, title: 'Dépenses' })]),
        closed: page([wallet('c')], 3),
        invitations: page([invitation('d')], 2),
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
        invitations: page([invitation('d', { creatorName: 'Alice' })]),
      }),
    );
    render(<WalletDashboard />);

    fireEvent.click(await screen.findByRole('tab', { name: /Clos/ }));
    expect(await screen.findByText(/Clos le 2 mai 2025/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Invitations/ }));
    expect(await screen.findByText('Invité par Alice')).toBeTruthy();
    expect(screen.queryByText('Porte-monnaie c')).toBeNull();
  });

  it('charge les trois sections avec une seule requête initiale', async () => {
    mocks.listWallets.mockResolvedValue(
      lists({
        open: page([wallet('a')]),
        closed: page([wallet('b')]),
        invitations: page([invitation('c')]),
      }),
    );
    render(<WalletDashboard />);

    expect(await screen.findByText('Porte-monnaie a')).toBeTruthy();
    expect(mocks.listWallets).toHaveBeenCalledTimes(1);
    expect(mocks.listWallets).toHaveBeenCalledWith({ limit: 10 });
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

describe('actions sur les invitations', () => {
  const accept = (name: string) =>
    screen.getByRole('button', { name: `Accepter l’invitation à ${name}` }) as HTMLButtonElement;
  const decline = (name: string) =>
    screen.getByRole('button', { name: `Refuser l’invitation à ${name}` }) as HTMLButtonElement;
  const tabCount = (name: RegExp) => screen.getByRole('tab', { name }).textContent;

  async function renderInvitations() {
    render(<WalletDashboard initialSection="invitations" />);
    await screen.findByText('Groupe a');
  }

  beforeEach(() => {
    mocks.listWallets.mockReset();
    mocks.acceptInvitation.mockReset();
    mocks.declineInvitation.mockReset();
    mocks.listWallets.mockResolvedValue(
      lists({
        open: page([wallet('o')], 1),
        invitations: page([invitation('a'), invitation('b')], 2),
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('accepte avec l’identifiant d’invitation et met à jour listes et compteurs', async () => {
    await renderInvitations();
    mocks.acceptInvitation.mockResolvedValue(undefined);
    mocks.listWallets.mockResolvedValue(
      lists({
        open: page([wallet('wallet-a', { title: 'Groupe a' }), wallet('o')], 2),
        invitations: page([invitation('b')], 1),
      }),
    );

    fireEvent.click(accept('Groupe a'));

    expect((await screen.findByRole('status')).textContent).toContain(
      'Vous avez rejoint le porte-monnaie « Groupe a ».',
    );
    expect(mocks.acceptInvitation).toHaveBeenCalledWith('invitation-a');
    expect(screen.getByRole('link', { name: 'Ouvrir « Groupe a »' }).getAttribute('href')).toBe(
      '/wallets/wallet-a',
    );
    await waitFor(() => expect(mocks.listWallets).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(accept('Groupe b').disabled).toBe(false));
    expect(screen.queryByText('Invité par Groupe a')).toBeNull();
    expect(tabCount(/Invitations/)).toContain('1');
    expect(tabCount(/Ouverts/)).toContain('2');

    fireEvent.click(screen.getByRole('tab', { name: /Ouverts/ }));
    expect(screen.getByRole('link', { name: /Groupe a.*Élodie/ })).toBeTruthy();
  });

  it('refuse avec l’identifiant d’invitation et met à jour les compteurs', async () => {
    await renderInvitations();
    mocks.declineInvitation.mockResolvedValue(undefined);
    mocks.listWallets.mockResolvedValue(
      lists({ open: page([wallet('o')], 1), invitations: page([invitation('b')], 1) }),
    );

    fireEvent.click(decline('Groupe a'));

    expect((await screen.findByRole('status')).textContent).toContain(
      'Invitation à « Groupe a » refusée.',
    );
    expect(mocks.declineInvitation).toHaveBeenCalledWith('invitation-a');
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    await waitFor(() => expect(accept('Groupe b').disabled).toBe(false));
    expect(screen.queryByText('Groupe a')).toBeNull();
    expect(tabCount(/Invitations/)).toContain('1');
    expect(tabCount(/Ouverts/)).toContain('1');
    // Un refus ne propose aucun lien : l'utilisateur n'a pas rejoint le porte-monnaie.
    expect(screen.queryByRole('link', { name: /Ouvrir/ })).toBeNull();
  });

  it('garde le message visible quand la dernière invitation est traitée', async () => {
    mocks.listWallets.mockResolvedValue(lists({ invitations: page([invitation('a')], 1) }));
    await renderInvitations();
    mocks.declineInvitation.mockResolvedValue(undefined);
    mocks.listWallets.mockResolvedValue(lists());

    fireEvent.click(decline('Groupe a'));

    expect(await screen.findByText('Aucune invitation en attente')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('refusée');
  });

  it('donne le focus au message quand la ligne traitée disparaît', async () => {
    mocks.listWallets.mockResolvedValue(lists({ invitations: page([invitation('a')], 1) }));
    await renderInvitations();
    mocks.declineInvitation.mockResolvedValue(undefined);
    mocks.listWallets.mockResolvedValue(lists());

    fireEvent.click(decline('Groupe a'));

    const notice = await screen.findByRole('status');
    await waitFor(() => expect(document.activeElement).toBe(notice));
  });

  describe.each([
    ['accepter', 'accept', () => mocks.acceptInvitation],
    ['refuser', 'decline', () => mocks.declineInvitation],
  ] as const)('erreurs en voulant %s', (_label, action, service) => {
    it.each([
      [403, 'Accès refusé', 'Cette invitation ne vous est pas destinée.'],
      [404, 'Invitation introuvable.', 'Cette invitation est introuvable. Elle a peut-être été retirée.'],
      [409, 'Cette invitation a déjà été traitée.', 'Cette invitation a déjà été traitée.'],
      [409, 'Ce porte-monnaie est fermé.', 'Ce porte-monnaie est clôturé : cette action n’est plus possible.'],
    ])('affiche l’erreur %i (%s) et recharge la liste', async (status, apiMessage, expected) => {
      await renderInvitations();
      service().mockRejectedValue(new ApiError(status, [apiMessage]));
      mocks.listWallets.mockResolvedValue(
        lists({ invitations: page([invitation('b')], 1) }),
      );

      fireEvent.click(action === 'accept' ? accept('Groupe a') : decline('Groupe a'));

      expect((await screen.findByRole('alert')).textContent).toBe(expected);
      await waitFor(() => expect(screen.queryByText('Groupe a')).toBeNull());
      expect(mocks.listWallets).toHaveBeenCalledTimes(2);
      expect(tabCount(/Invitations/)).toContain('1');
      await waitFor(() => expect(accept('Groupe b').disabled).toBe(false));
    });
  });

  it('reste exact si le 409 mêle les deux causes ou change de formulation', async () => {
    await renderInvitations();
    mocks.acceptInvitation.mockRejectedValue(
      new ApiError(409, ['Cette invitation a déjà été traitée ou le porte-monnaie est fermé.']),
    );

    fireEvent.click(accept('Groupe a'));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Cette invitation n’est plus disponible : elle a déjà été traitée ou le porte-monnaie est clôturé.',
    );
  });

  it.each([
    ['une erreur serveur', new ApiError(500), 'Le serveur a rencontré une erreur'],
    ['une coupure réseau', new TypeError('fetch failed'), 'Impossible de joindre le serveur'],
  ])('garde la liste pour réessayer après %s', async (_label, error, expected) => {
    await renderInvitations();
    mocks.acceptInvitation.mockRejectedValue(error);

    fireEvent.click(accept('Groupe a'));

    expect((await screen.findByRole('alert')).textContent).toContain(expected);
    await waitFor(() => expect(accept('Groupe a').disabled).toBe(false));
    expect(mocks.listWallets).toHaveBeenCalledTimes(1);
  });

  it('vérifie auprès du serveur quand la réponse d’action est illisible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderInvitations();
    mocks.acceptInvitation.mockRejectedValue(new Error('réponse invalide'));

    fireEvent.click(accept('Groupe a'));

    expect((await screen.findByRole('alert')).textContent).toContain('erreur inattendue');
    await waitFor(() => expect(mocks.listWallets).toHaveBeenCalledTimes(2));
  });

  it('propose de réessayer si le rechargement échoue après un conflit', async () => {
    await renderInvitations();
    mocks.acceptInvitation.mockRejectedValue(new ApiError(404));
    mocks.listWallets.mockRejectedValueOnce(new ApiError(500));

    fireEvent.click(accept('Groupe a'));

    expect(await screen.findByRole('heading', { name: 'Chargement impossible' })).toBeTruthy();
    // La liste périmée n'est plus affichée à côté du message d'erreur.
    expect(screen.queryByText('Groupe a')).toBeNull();
    expect(screen.getAllByRole('alert')[0].textContent).toContain('introuvable');

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Réessayer' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Groupe b')).toBeTruthy();
  });

  it('retire la ligne malgré un rechargement en échec et signale la liste Ouverts', async () => {
    await renderInvitations();
    mocks.acceptInvitation.mockResolvedValue(undefined);
    mocks.listWallets.mockRejectedValueOnce(new TypeError('fetch failed'));

    fireEvent.click(accept('Groupe a'));

    expect((await screen.findByRole('status')).textContent).toContain('Vous avez rejoint');
    expect(screen.queryByText('Groupe a')).toBeNull();
    expect(screen.getByText('Groupe b')).toBeTruthy();
    expect(tabCount(/Invitations/)).toContain('1');
    expect(tabCount(/Ouverts/)).toContain('2');

    await waitFor(() => expect(accept('Groupe b').disabled).toBe(false));
    fireEvent.click(screen.getByRole('tab', { name: /Ouverts/ }));
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('ne déclenche qu’une action à la fois, même sur un double clic', async () => {
    await renderInvitations();
    let finish: () => void = () => undefined;
    mocks.acceptInvitation.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    const button = accept('Groupe a');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(decline('Groupe a'));
    fireEvent.click(accept('Groupe b'));

    expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1);
    expect(mocks.declineInvitation).not.toHaveBeenCalled();
    expect(button.textContent).toBe('Acceptation…');
    expect(decline('Groupe a').textContent).toBe('Refuser');
    expect(decline('Groupe a').disabled).toBe(true);
    expect(accept('Groupe b').disabled).toBe(true);

    finish();
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('reste sur la page d’invitations affichée après une action', async () => {
    mocks.listWallets.mockImplementation(
      async ({ cursor }: { section?: string; cursor?: string }) =>
        cursor === 'cursor-2'
          ? lists({ invitations: page([invitation('k'), invitation('l')], 12) })
          : lists({ invitations: page([invitation('a')], 12, 'cursor-2') }),
    );
    await renderInvitations();
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await screen.findByText('Groupe k');
    mocks.declineInvitation.mockResolvedValue(undefined);

    fireEvent.click(decline('Groupe k'));

    await screen.findByRole('status');
    await waitFor(() =>
      expect(mocks.listWallets).toHaveBeenLastCalledWith({
        section: 'invitations',
        cursor: 'cursor-2',
        limit: 10,
      }),
    );
    expect(await screen.findByText('Page 2 sur 2')).toBeTruthy();
  });

  it('revient à la première page quand la page affichée se vide', async () => {
    mocks.listWallets.mockImplementation(
      async ({ cursor }: { section?: string; cursor?: string }) =>
        cursor === 'cursor-2'
          ? lists({ invitations: page([invitation('k')], 11) })
          : lists({ invitations: page([invitation('a')], 11, 'cursor-2') }),
    );
    await renderInvitations();
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await screen.findByText('Groupe k');
    mocks.declineInvitation.mockResolvedValue(undefined);
    mocks.listWallets.mockImplementation(async ({ cursor }: { cursor?: string }) =>
      cursor === 'cursor-2'
        ? lists({ invitations: page([], 10) })
        : lists({ invitations: page([invitation('a')], 10) }),
    );

    fireEvent.click(decline('Groupe k'));

    expect(await screen.findByText('Groupe a')).toBeTruthy();
    expect(screen.queryByText('Aucune invitation en attente')).toBeNull();
  });

  it('ignore une page demandée avant l’action et reçue après', async () => {
    mocks.listWallets.mockResolvedValue(
      lists({
        open: page([wallet('o')], 12, 'cursor-open'),
        invitations: page([invitation('a')], 1),
      }),
    );
    await renderInvitations();

    fireEvent.click(screen.getByRole('tab', { name: /Ouverts/ }));
    let resolveOld: (value: WalletLists) => void = () => undefined;
    mocks.listWallets.mockReturnValueOnce(
      new Promise<WalletLists>((resolve) => (resolveOld = resolve)),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    fireEvent.click(screen.getByRole('tab', { name: /Invitations/ }));
    mocks.acceptInvitation.mockResolvedValue(undefined);
    mocks.listWallets.mockResolvedValue(
      lists({ open: page([wallet('wallet-a', { title: 'Groupe a' })], 13) }),
    );
    fireEvent.click(accept('Groupe a'));
    await screen.findByRole('status');
    await waitFor(() => expect(tabCount(/Ouverts/)).toContain('13'));

    resolveOld(lists({ open: page([wallet('old', { title: 'Ancienne page' })], 12) }));
    await new Promise((resolve) => setTimeout(resolve));

    expect(tabCount(/Ouverts/)).toContain('13');
    fireEvent.click(screen.getByRole('tab', { name: /Ouverts/ }));
    expect(screen.queryByText('Ancienne page')).toBeNull();
  });
});
