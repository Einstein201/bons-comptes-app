import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from './api';
import { createWallet, listWallets } from './wallets';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setAccessToken('access');
});

afterEach(() => {
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
