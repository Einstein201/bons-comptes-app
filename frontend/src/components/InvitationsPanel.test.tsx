// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { acceptInvitation, getInvitations, type Invitation } from '../services/invitations';
import { InvitationsPanel } from './InvitationsPanel';

vi.mock('../services/invitations', () => ({
  acceptInvitation: vi.fn(),
  getInvitations: vi.fn(),
}));

const first: Invitation = {
  id: 'invitation-1',
  invitedAt: '2026-11-02T10:00:00.000Z',
  wallet: { id: 'wallet-1', title: 'Vacances', description: 'Été 2026', status: 'OPEN' },
};
const second: Invitation = {
  id: 'invitation-2',
  invitedAt: '2026-11-01T10:00:00.000Z',
  wallet: { id: 'wallet-2', title: 'Colocation', description: null, status: 'OPEN' },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getInvitations).mockResolvedValue({ data: [first, second], nextCursor: null });
});

afterEach(cleanup);

it('affiche les invitations reçues', async () => {
  render(<InvitationsPanel />);

  await screen.findByText('Vacances');
  expect(screen.getByText('Colocation')).toBeDefined();
  expect(screen.getByText('Été 2026')).toBeDefined();
  expect(screen.getAllByRole('button', { name: /Accepter l’invitation/ })).toHaveLength(2);
});

it('affiche un état vide explicite', async () => {
  vi.mocked(getInvitations).mockResolvedValue({ data: [], nextCursor: null });
  render(<InvitationsPanel />);

  await screen.findByText('Vous n’avez aucune invitation en attente.');
});

it('accepte avec l’identifiant d’invitation, retire la ligne sans recharger et propose d’ouvrir le portefeuille', async () => {
  vi.mocked(acceptInvitation).mockResolvedValue();
  vi.mocked(getInvitations).mockResolvedValueOnce({ data: [first, second], nextCursor: null });
  render(<InvitationsPanel />);

  await screen.findByText('Vacances');
  fireEvent.click(screen.getByRole('button', { name: 'Accepter l’invitation à Vacances' }));

  await screen.findByText('Vous avez rejoint le porte-monnaie « Vacances ».');
  expect(acceptInvitation).toHaveBeenCalledWith('invitation-1');
  expect(getInvitations).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Accepter l’invitation à Vacances' })).toBeNull();
  expect(screen.getByRole('button', { name: /Accepter l’invitation à/ })).toBeTruthy();
  const link = screen.getByRole('link', { name: 'Ouvrir « Vacances »' });
  expect(link.getAttribute('href')).toBe('/wallets/wallet-1');
});

it.each([
  [403, 'Cette invitation ne vous est pas destinée.'],
  [404, 'Cette invitation est introuvable. Elle a peut-être été retirée.'],
  [409, 'Cette invitation a déjà été traitée.'],
])('explique clairement l’erreur %i sans annoncer de succès', async (status, message) => {
  vi.mocked(acceptInvitation).mockRejectedValue(new ApiError(status, ['Cette invitation a déjà été traitée.']));
  render(<InvitationsPanel />);

  await screen.findByText('Vacances');
  fireEvent.click(screen.getByRole('button', { name: 'Accepter l’invitation à Vacances' }));

  await screen.findByText(message);
  expect(screen.queryByText(/Vous avez rejoint/)).toBeNull();
  await waitFor(() => expect(getInvitations).toHaveBeenCalledTimes(2));
});

it('charge la page suivante avec le curseur', async () => {
  vi.mocked(getInvitations)
    .mockResolvedValueOnce({ data: [first], nextCursor: 'cursor-2' })
    .mockResolvedValueOnce({ data: [second], nextCursor: null });
  render(<InvitationsPanel />);

  await screen.findByText('Vacances');
  fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }));

  await screen.findByText('Colocation');
  expect(getInvitations).toHaveBeenLastCalledWith({ limit: 10, cursor: 'cursor-2' });
  expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
});

it('signale l’échec du chargement', async () => {
  vi.mocked(getInvitations).mockRejectedValue(new ApiError(500));
  render(<InvitationsPanel />);

  await screen.findByText('Le serveur a rencontré une erreur. Réessayez dans un instant.');
});
