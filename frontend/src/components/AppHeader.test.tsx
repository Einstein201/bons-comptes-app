// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  replace: vi.fn(),
  pathname: '/',
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));

vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}));

vi.mock('./AccountInfoModal', () => ({
  AccountInfoModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <span>Informations du compte</span>
      <button type="button" onClick={onClose}>Fermer</button>
    </div>
  ),
}));

describe('AppHeader', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ouvre le menu puis le profil', () => {
    mocks.useAuth.mockReturnValue({
      status: 'authenticated',
      user: { userId: 'user-1', email: 'alice@example.com', name: 'Alice' },
      signOut: vi.fn(),
      updateName: vi.fn(),
    });
    render(<AppHeader />);

    expect(screen.queryByRole('button', { name: 'Déconnexion' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profil' }));

    expect(screen.getByRole('dialog')).not.toBeNull();
  });

  it('ferme le menu au clic extérieur et avec Échap', () => {
    mocks.useAuth.mockReturnValue({
      status: 'authenticated',
      user: { userId: 'user-1', email: 'alice@example.com', name: 'Alice' },
      signOut: vi.fn(),
      updateName: vi.fn(),
    });
    render(<AppHeader />);
    const accountButton = screen.getByRole('button', { name: 'Alice' });

    fireEvent.click(accountButton);
    expect(screen.getByRole('menuitem', { name: 'Profil' })).not.toBeNull();
    fireEvent.keyDown(accountButton, { key: 'Escape' });
    expect(screen.queryByRole('menuitem', { name: 'Profil' })).toBeNull();

    fireEvent.click(accountButton);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menuitem', { name: 'Profil' })).toBeNull();
  });

  it('déconnecte depuis le menu du compte', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({
      status: 'authenticated',
      user: { userId: 'user-1', email: 'alice@example.com', name: 'Alice' },
      signOut,
      updateName: vi.fn(),
    });
    render(<AppHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Déconnexion' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith('/login');
  });

  it('masque le lien de connexion sur /login mais le garde sur /register', () => {
    mocks.useAuth.mockReturnValue({ status: 'unauthenticated' });
    mocks.pathname = '/login';
    const { unmount } = render(<AppHeader />);

    expect(screen.queryByRole('link', { name: 'Connexion' })).toBeNull();

    unmount();
    mocks.pathname = '/register';
    render(<AppHeader />);

    expect(screen.getByRole('link', { name: 'Connexion' }).getAttribute('href'))
      .toBe('/login');
  });
});
