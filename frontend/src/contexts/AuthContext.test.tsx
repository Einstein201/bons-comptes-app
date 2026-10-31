// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { setAccessToken } from '../services/api';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  restoreSession: vi.fn(),
}));

vi.mock('../services/auth', () => ({
  login: mocks.login,
  logout: mocks.logout,
  restoreSession: mocks.restoreSession,
}));

describe('contexte de session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.restoreSession.mockResolvedValue({ userId: 'user-1' });
    mocks.login.mockResolvedValue({ userId: 'user-1' });
    mocks.logout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    setAccessToken(null);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('restaure la session au montage', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual({ userId: 'user-1' });
  });

  it('permet de réessayer après une erreur réseau', async () => {
    mocks.restoreSession.mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ userId: 'user-1' });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    await act(() => result.current.retrySession());
    expect(result.current.status).toBe('authenticated');
  });

  it('met à jour l’état après connexion et déconnexion', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(() => result.current.signIn({
      email: 'alice@example.com', password: 'password123',
    }));
    expect(result.current.user).toEqual({ userId: 'user-1' });
    await act(() => result.current.signOut());
    expect(result.current.user).toBeNull();
    expect(result.current.status).toBe('signed-out');
  });

  it('efface l’utilisateur si le token est invalidé', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => setAccessToken(null));
    expect(result.current.user).toBeNull();
    expect(result.current.status).toBe('unauthenticated');
  });
});
