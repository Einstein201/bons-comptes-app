// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { WalletForm } from './WalletForm';

const mocks = vi.hoisted(() => ({ createWallet: vi.fn() }));

vi.mock('../services/wallets', () => ({ createWallet: mocks.createWallet }));

function fillTitle(value: string) {
  fireEvent.change(screen.getByLabelText(/Nom du porte-monnaie/), { target: { value } });
}

describe('création d’un porte-monnaie', () => {
  beforeEach(() => {
    mocks.createWallet.mockReset();
  });
  afterEach(cleanup);

  it('envoie le titre et la description puis propose d’ouvrir le porte-monnaie', async () => {
    mocks.createWallet.mockResolvedValue({ id: 'w1', title: 'Voyage' });
    render(<WalletForm />);

    fillTitle('  Voyage  ');
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Lisbonne' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le porte-monnaie' }));

    expect((await screen.findByRole('status')).textContent).toContain('Voyage');
    expect(mocks.createWallet).toHaveBeenCalledWith({
      title: 'Voyage',
      description: 'Lisbonne',
    });
    expect(
      screen.getByRole('link', { name: 'Ouvrir le porte-monnaie' }).getAttribute('href'),
    ).toBe('/wallets/w1');
    expect(screen.getByRole('link', { name: 'Mes porte-monnaie' }).getAttribute('href')).toBe('/');
  });

  it('n’appelle pas l’API quand le titre est vide', () => {
    render(<WalletForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Créer le porte-monnaie' }));
    expect(screen.getByText('Le nom est obligatoire')).toBeTruthy();
    expect(mocks.createWallet).not.toHaveBeenCalled();
  });

  it('affiche l’erreur de validation renvoyée par l’API', async () => {
    mocks.createWallet.mockImplementation(() => Promise.reject(new ApiError(400, ['title must be shorter'])));
    render(<WalletForm />);

    fillTitle('Voyage');
    fireEvent.click(screen.getByRole('button', { name: 'Créer le porte-monnaie' }));

    expect((await screen.findAllByRole('alert')).map((node) => node.textContent).join(' ')).toContain('invalides');
    expect(screen.getByText(/Le nom est invalide/)).toBeTruthy();
  });

  it('affiche une erreur serveur sans perdre la saisie', async () => {
    mocks.createWallet.mockImplementation(() => Promise.reject(new ApiError(500)));
    render(<WalletForm />);

    fillTitle('Voyage');
    fireEvent.click(screen.getByRole('button', { name: 'Créer le porte-monnaie' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Le serveur');
    expect((screen.getByLabelText(/Nom du porte-monnaie/) as HTMLInputElement).value).toBe(
      'Voyage',
    );
  });
});
