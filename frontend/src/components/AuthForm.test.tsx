// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { AuthForm } from './AuthForm';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
  register: vi.fn(),
  status: 'unauthenticated' as 'unauthenticated' | 'authenticated',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signIn: mocks.signIn, status: mocks.status }),
}));

vi.mock('../services/auth', () => ({
  register: mocks.register,
}));

describe('formulaires d’authentification', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'unauthenticated';
    window.history.replaceState({}, '', '/login');
  });

  it('connecte l’utilisateur et retourne vers le chemin interne demandé', async () => {
    window.history.replaceState({}, '', '/login?next=%2Fwallets%2Fnew');
    mocks.signIn.mockResolvedValue(undefined);
    render(<AuthForm mode="login" />);

    fireEvent.change(screen.getByLabelText(/^Adresse email/), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Se connecter' }).closest('form')!);

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith({
      email: 'alice@example.com', password: 'password123',
    }));
    expect(mocks.replace).toHaveBeenCalledWith('/wallets/new');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('refuse une destination externe après authentification', async () => {
    window.history.replaceState({}, '', '/login?next=%2F%2Fevil.example');
    mocks.signIn.mockResolvedValue(undefined);
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText(/^Adresse email/), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Se connecter' }).closest('form')!);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
  });

  it('affiche une erreur de connexion sans révéler de détails serveur', async () => {
    mocks.signIn.mockRejectedValue(new ApiError(401, ['Unauthorized']));
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText(/^Adresse email/), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), {
      target: { value: 'bad-password' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Se connecter' }).closest('form')!);
    expect((await screen.findByRole('alert')).textContent)
      .toContain('Adresse email ou mot de passe incorrect.');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('inscrit l’utilisateur puis le dirige vers la connexion', async () => {
    mocks.register.mockResolvedValue(undefined);
    render(<AuthForm mode="register" />);
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: ' Alice ' } });
    fireEvent.change(screen.getByLabelText(/^Adresse email/), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Créer mon compte' }).closest('form')!);

    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith({
      name: 'Alice', email: 'alice@example.com', password: 'password123',
    }));
    expect(mocks.replace).toHaveBeenCalledWith('/login?registered=1');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('n’affiche pas le surtitre Créer un compte au-dessus de l’inscription', () => {
    render(<AuthForm mode="register" />);

    expect(screen.queryByText('Créer un compte', { exact: true })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Inscription' }).className)
      .toContain('registerTitle');
  });

  it('expose les contraintes HTML des champs obligatoires', () => {
    render(<AuthForm mode="register" />);
    const nameInput = screen.getByLabelText(/^Nom/) as HTMLInputElement;
    expect(nameInput.required).toBe(true);
    expect(nameInput.labels?.[0].querySelector('[aria-hidden="true"]')?.textContent).toBe('*');
    expect((screen.getByLabelText(/^Adresse email/) as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText(/^Mot de passe/) as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText(/^Mot de passe/) as HTMLInputElement).minLength).toBe(8);
  });

  it('masque l’accroche de connexion', () => {
    render(<AuthForm mode="login" />);
    expect(
      screen.queryByText('Connectez-vous pour retrouver vos porte-monnaies.'),
    ).toBeNull();
  });

  it('masque le surtitre de création de compte', () => {
    render(<AuthForm mode="register" />);
    expect(screen.queryByText('Créer un compte')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Inscription' })).not.toBeNull();
  });
});
