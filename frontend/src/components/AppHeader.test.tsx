// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
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

  it('ouvre le menu puis la modale des informations du compte', () => {
    mocks.useAuth.mockReturnValue({
      status: 'authenticated',
      user: { userId: 'user-1', email: 'alice@example.com', name: 'Alice' },
      signOut: vi.fn(),
      updateName: vi.fn(),
    });
    render(<AppHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Informations du compte' }));

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
    expect(screen.getByRole('button', { name: 'Informations du compte' })).not.toBeNull();
    fireEvent.keyDown(accountButton, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Informations du compte' })).toBeNull();

    fireEvent.click(accountButton);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: 'Informations du compte' })).toBeNull();
  });
});
