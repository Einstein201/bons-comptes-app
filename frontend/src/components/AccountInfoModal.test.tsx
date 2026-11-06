// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountInfoModal } from './AccountInfoModal';
import { ApiError } from '../services/api';

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
}));

vi.mock('../services/auth', async () => {
  const actual = await vi.importActual<typeof import('../services/auth')>('../services/auth');
  return { ...actual, changePassword: mocks.changePassword };
});

describe('AccountInfoModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderModal(onNameChange = vi.fn().mockResolvedValue(undefined)) {
    return render(
      <AccountInfoModal
        name="Alice"
        email="alice@example.com"
        onNameChange={onNameChange}
        onClose={vi.fn()}
      />,
    );
  }

  it('affiche l’email en lecture seule et permet de modifier le nom', async () => {
    const onNameChange = vi.fn().mockResolvedValue(undefined);
    renderModal(onNameChange);

    expect(screen.getByText('alice@example.com')).not.toBeNull();
    expect(screen.getByText('Lecture seule')).not.toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Alice Martin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(onNameChange).toHaveBeenCalledWith('Alice Martin'));
    expect(screen.getByRole('status').textContent).toContain('Nom mis à jour.');
  });

  it('valide la confirmation et efface les mots de passe après un succès', async () => {
    mocks.changePassword.mockResolvedValue(undefined);
    renderModal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[1]);
    fireEvent.change(screen.getByLabelText('Ancien mot de passe'), { target: { value: 'ancien' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'nouveau123' } });
    fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }));
    expect((await screen.findByRole('alert')).textContent).toContain('confirmation');

    fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: 'nouveau123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }));
    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledWith({
      currentPassword: 'ancien',
      newPassword: 'nouveau123',
    }));
    expect(screen.queryByDisplayValue('ancien')).toBeNull();
    expect(screen.queryByDisplayValue('nouveau123')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Mot de passe modifié.');
  });

  it.each([400, 401, 409])('affiche lisiblement une erreur HTTP %s', async (status) => {
    mocks.changePassword.mockRejectedValue(new ApiError(status, [`Erreur ${status}`]));
    renderModal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[1]);
    fireEvent.change(screen.getByLabelText('Ancien mot de passe'), { target: { value: 'ancien' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'nouveau123' } });
    fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: 'nouveau123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }));

    expect((await screen.findByRole('alert')).textContent).toContain(`Erreur ${status}`);
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveProperty('value', 'nouveau123');
  });

  it('valide la longueur minimale du nouveau mot de passe côté client', async () => {
    renderModal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[1]);
    fireEvent.change(screen.getByLabelText('Ancien mot de passe'), { target: { value: 'ancien' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'court' } });
    fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: 'court' } });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }));

    expect((await screen.findByRole('alert')).textContent).toContain('au moins 8 caractères');
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });
});
