import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAccessToken, setAccessToken } from './api';
import { getCurrentUser, login, logout, register, restoreSession } from './auth';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("inscrit l'utilisateur sans transmettre de token", async () => {
  fetchMock.mockResolvedValue(Response.json({ id: 'user' }, { status: 201 }));
  const input = { name: 'Alice', email: 'alice@example.com', password: 'password-test' };
  await register(input);
  expect(fetchMock.mock.calls[0][0].toString()).toBe('http://localhost:3000/users');
  expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify(input));
  expect(getAccessToken()).toBeNull();
});

it('se connecte avec les cookies et consulte le contrat réel de /auth/me', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ accessToken: 'access' }))
    .mockResolvedValueOnce(Response.json({ userId: 'user' }));
  await expect(login({ email: 'alice@example.com', password: 'password-test' }))
    .resolves.toEqual({ userId: 'user' });
  expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include');
  expect(getAccessToken()).toBe('access');
  expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization'))
    .toBe('Bearer access');
});

it('restaure la session via le refresh puis /auth/me', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ accessToken: 'restored' }))
    .mockResolvedValueOnce(Response.json({ userId: 'user' }));
  await expect(restoreSession()).resolves.toEqual({ userId: 'user' });
  expect(getAccessToken()).toBe('restored');
});

it('rejette un profil mal formé', async () => {
  setAccessToken('access');
  fetchMock.mockResolvedValue(Response.json({ name: 'Alice' }));
  await expect(getCurrentUser()).rejects.toThrow("utilisateur valide");
});

it('déconnecte côté serveur avant de nettoyer la mémoire', async () => {
  setAccessToken('access');
  fetchMock.mockResolvedValue(Response.json({ message: 'Logout successful' }));
  await logout();
  expect(fetchMock.mock.calls[0][0].toString()).toBe('http://localhost:3000/auth/logout');
  expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include');
  expect(getAccessToken()).toBeNull();
});

it('signale un échec de déconnexion au lieu de simuler un succès', async () => {
  setAccessToken('access');
  fetchMock.mockRejectedValue(new TypeError('Network error'));
  await expect(logout()).rejects.toThrow('Network error');
  expect(getAccessToken()).toBeNull();
});
