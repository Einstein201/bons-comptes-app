// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: '/wallets/new',
  status: 'loading' as 'loading' | 'authenticated' | 'unauthenticated' | 'signed-out' | 'unavailable',
  retrySession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ status: mocks.status, retrySession: mocks.retrySession }),
}));

describe('protection des pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'loading';
    mocks.pathname = '/wallets/new';
  });

  afterEach(cleanup);

  it('n’affiche pas le contenu avant la vérification de session', () => {
    render(<ProtectedRoute><p>Contenu privé</p></ProtectedRoute>);
    expect(screen.getByRole('status').textContent).toContain('Vérification');
    expect(screen.queryByText('Contenu privé')).toBeNull();
  });

  it('redirige un visiteur en conservant la page demandée', async () => {
    mocks.status = 'unauthenticated';
    render(<ProtectedRoute><p>Contenu privé</p></ProtectedRoute>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      '/login?next=%2Fwallets%2Fnew',
    ));
    expect(screen.queryByText('Contenu privé')).toBeNull();
  });

  it('n’ajoute pas de destination de retour après une déconnexion volontaire', async () => {
    mocks.status = 'signed-out';
    render(<ProtectedRoute><p>Contenu privé</p></ProtectedRoute>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
  });

  it('affiche le contenu uniquement après authentification', () => {
    mocks.status = 'authenticated';
    render(<ProtectedRoute><p>Contenu privé</p></ProtectedRoute>);
    expect(screen.getByText('Contenu privé')).toBeTruthy();
  });

  it('propose une nouvelle tentative si le serveur est indisponible', async () => {
    mocks.status = 'unavailable';
    render(<ProtectedRoute><p>Contenu privé</p></ProtectedRoute>);
    expect(screen.getByRole('alert').textContent).toContain('Connexion au serveur impossible');
    expect(screen.queryByText('Contenu privé')).toBeNull();
  });
});
