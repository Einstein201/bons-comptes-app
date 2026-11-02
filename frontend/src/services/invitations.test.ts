import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, setAccessToken } from './api';
import { acceptInvitation, getInvitations, sendInvitation } from './invitations';

const fetchMock = vi.fn<typeof fetch>();
const invitation = {
  id: 'invitation-1',
  invitedAt: '2026-11-02T10:00:00.000Z',
  wallet: { id: 'wallet-1', title: 'Vacances', description: null, status: 'OPEN' },
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setAccessToken('access');
});

afterEach(() => {
  setAccessToken(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('envoie une invitation par email', async () => {
  fetchMock.mockResolvedValue(Response.json(invitation, { status: 201 }));

  await expect(sendInvitation('wallet/1', 'bob@example.com')).resolves.toEqual(invitation);

  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe('http://localhost:3000/wallets/wallet%2F1/invitations');
  expect(init?.method).toBe('POST');
  expect(init?.body).toBe(JSON.stringify({ email: 'bob@example.com' }));
});

it('charge les invitations reçues avec le curseur', async () => {
  const page = { data: [invitation], nextCursor: 'next' };
  fetchMock.mockResolvedValue(Response.json(page));

  await expect(getInvitations({ limit: 5, cursor: 'abc' })).resolves.toEqual(page);

  expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:3000/invitations?limit=5&cursor=abc');
});

it('refuse une liste d’invitations invalide', async () => {
  fetchMock.mockResolvedValue(Response.json({ data: [{ id: '' }], nextCursor: null }));

  await expect(getInvitations()).rejects.toThrow('invalide');
});

it('accepte une invitation avec son identifiant', async () => {
  fetchMock.mockResolvedValue(Response.json({ id: 'invitation-1', status: 'MEMBER' }));

  await expect(acceptInvitation('invitation-1')).resolves.toBeUndefined();

  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe('http://localhost:3000/invitations/invitation-1/accept');
  expect(init?.method).toBe('POST');
});

it('refuse une réponse d’acceptation incohérente', async () => {
  fetchMock.mockResolvedValue(Response.json({ id: 'other', status: 'MEMBER' }));

  await expect(acceptInvitation('invitation-1')).rejects.toThrow('invalide');
});

it.each([403, 404, 409])('propage l’erreur %i de l’API', async (status) => {
  fetchMock.mockResolvedValue(Response.json({ message: 'Refusé' }, { status }));

  await expect(sendInvitation('wallet-1', 'bob@example.com')).rejects.toMatchObject({ status });
  await expect(sendInvitation('wallet-1', 'bob@example.com')).rejects.toBeInstanceOf(ApiError);
});
