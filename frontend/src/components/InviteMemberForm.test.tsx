// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { sendInvitation } from '../services/invitations';
import { InviteMemberForm } from './InviteMemberForm';

vi.mock('../services/invitations', () => ({ sendInvitation: vi.fn() }));

const onInvited = vi.fn<() => Promise<void>>();

beforeEach(() => {
  vi.resetAllMocks();
  onInvited.mockResolvedValue();
});

afterEach(cleanup);

function submit(email: string) {
  fireEvent.change(screen.getByLabelText(/Adresse email/), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));
}

it('envoie l’invitation, confirme et actualise les membres', async () => {
  vi.mocked(sendInvitation).mockResolvedValue({
    id: 'invitation-1',
    invitedAt: '2026-11-02T10:00:00.000Z',
    wallet: { id: 'wallet-1', title: 'Vacances', description: null, status: 'OPEN' },
  });
  render(<InviteMemberForm walletId="wallet-1" onInvited={onInvited} />);

  submit(' bob@example.com ');

  await screen.findByText('Une invitation a été envoyée à bob@example.com.');
  expect(sendInvitation).toHaveBeenCalledWith('wallet-1', 'bob@example.com');
  expect(onInvited).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText(/Adresse email/) as HTMLInputElement).value).toBe('');
});

it('refuse une adresse invalide sans appeler l’API', async () => {
  render(<InviteMemberForm walletId="wallet-1" onInvited={onInvited} />);

  submit('pas-un-email');

  await screen.findByText('Saisissez une adresse email valide.');
  expect(sendInvitation).not.toHaveBeenCalled();
});

it.each([
  [403, ['Seul le créateur peut inviter un utilisateur.'], 'Seul le créateur du porte-monnaie peut inviter un utilisateur.'],
  [404, ['Utilisateur introuvable.'], 'Aucun utilisateur inscrit ne correspond à cette adresse email.'],
  [404, ['Porte-monnaie introuvable.'], 'Ce porte-monnaie est introuvable.'],
  [409, ['Cet utilisateur est déjà invité ou membre.'], 'Cet utilisateur est déjà invité ou membre de ce porte-monnaie.'],
  [409, ['Ce porte-monnaie est fermé.'], 'Ce porte-monnaie est clôturé : cette action n’est plus possible.'],
])('présente clairement l’erreur %i', async (status, messages, expected) => {
  vi.mocked(sendInvitation).mockRejectedValue(new ApiError(status, messages));
  render(<InviteMemberForm walletId="wallet-1" onInvited={onInvited} />);

  submit('bob@example.com');

  await screen.findByText(expected);
  expect(screen.queryByText(/a été envoyée/)).toBeNull();
  expect(onInvited).not.toHaveBeenCalled();
});

it('signale que la liste des membres n’a pas pu être actualisée', async () => {
  vi.mocked(sendInvitation).mockResolvedValue({
    id: 'invitation-1',
    invitedAt: '2026-11-02T10:00:00.000Z',
    wallet: { id: 'wallet-1', title: 'Vacances', description: null, status: 'OPEN' },
  });
  onInvited.mockRejectedValue(new Error('réseau'));
  render(<InviteMemberForm walletId="wallet-1" onInvited={onInvited} />);

  submit('bob@example.com');

  await screen.findByText(/n’a pas pu être actualisée/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer l’invitation' })).toHaveProperty('disabled', false));
});
