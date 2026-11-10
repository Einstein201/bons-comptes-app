import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setAccessToken } from './api';
import { createWallet, getWallet, listWallets } from './wallets';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });
const wallet = {
  id: 'wallet-1', title: 'Voyage', description: null, status: 'OPEN',
  createdAt: '2026-11-01T10:00:00.000Z',
};
const details = {
  wallet: { ...wallet, isCreator: true },
  members: {
    items: [{
      userId: 'user-1', name: 'Alice', email: 'alice@example.com', status: 'MEMBER',
      invitedAt: wallet.createdAt, acceptedAt: wallet.createdAt,
    }],
    nextCursor: null,
  },
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

function requestedUrl(): URL {
  return new URL(String(fetchMock.mock.calls[0][0]));
}

describe('listWallets', () => {
  it('demande la première page de chaque section avec la limite', async () => {
    fetchMock.mockResolvedValue(json({}));
    await listWallets({ limit: 5 });
    expect(requestedUrl().pathname).toBe('/wallets');
    expect(requestedUrl().searchParams.get('limit')).toBe('5');
    expect(requestedUrl().searchParams.has('openCursor')).toBe(false);
  });

  it.each([
    ['open', 'openCursor'],
    ['closed', 'closedCursor'],
    ['invitations', 'invitationsCursor'],
  ] as const)('envoie uniquement le curseur de la section %s', async (section, param) => {
    fetchMock.mockResolvedValue(json({}));
    await listWallets({ section, cursor: 'abc' });
    const { searchParams } = requestedUrl();
    expect(searchParams.get(param)).toBe('abc');
    expect([...searchParams.keys()].filter((key) => key.endsWith('Cursor'))).toEqual([param]);
  });
});

describe('createWallet', () => {
  it('envoie uniquement le titre et la description', async () => {
    fetchMock.mockResolvedValue(json({ id: 'w1', title: 'Voyage' }, 201));
    await createWallet({ title: 'Voyage', description: 'Lisbonne' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Voyage',
      description: 'Lisbonne',
    });
  });
});

it('conserve le contrat de création existant', async () => {
  fetchMock.mockResolvedValue(Response.json(wallet, { status: 201 }));
  await expect(createWallet({ title: 'Voyage' })).resolves.toEqual(wallet);
  expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ title: 'Voyage' }));
});

it('charge le détail authentifié et sa pagination', async () => {
  fetchMock.mockResolvedValue(Response.json(details));
  await expect(getWallet('wallet-1', { limit: 20, cursor: 'member-1' })).resolves.toEqual(details);
  expect(fetchMock.mock.calls[0][0].toString())
    .toBe('http://localhost:3000/wallets/wallet-1?limit=20&cursor=member-1');
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(true);
});

it('accepte un portefeuille fermé et un membre non créateur', async () => {
  const body = { ...details, wallet: { ...details.wallet, status: 'CLOSED', isCreator: false } };
  fetchMock.mockResolvedValue(Response.json(body));
  await expect(getWallet('wallet-1')).resolves.toEqual(body);
});

it.each([
  { ...details, wallet: { ...wallet } },
  { ...details, wallet: { ...details.wallet, id: 'other' } },
  { ...details, wallet: { ...details.wallet, status: 'UNKNOWN' } },
  { ...details, members: { items: [{}], nextCursor: null } },
  { ...details, members: { items: [], nextCursor: 12 } },
])('rejette un détail mal formé (%#)', async (body) => {
  fetchMock.mockResolvedValue(Response.json(body));
  await expect(getWallet('wallet-1')).rejects.toThrow('détail du porte-monnaie est invalide');
});

it('propage le refus d’accès', async () => {
  fetchMock.mockResolvedValue(Response.json({ message: 'Accès refusé' }, { status: 403 }));
  await expect(getWallet('wallet-1')).rejects.toBeInstanceOf(ApiError);
});
