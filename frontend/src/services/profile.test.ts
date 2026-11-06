import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from './api';
import { updateProfile } from './profile';

const fetchMock = vi.fn<typeof fetch>();

describe('profile service', () => {
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

  it('met à jour le nom avec une requête authentifiée', async () => {
    fetchMock.mockResolvedValue(Response.json({ userId: 'user-1', name: 'Alice' }));

    await expect(updateProfile('Alice')).resolves.toEqual({ name: 'Alice' });

    expect(fetchMock.mock.calls[0][0].toString()).toBe('http://localhost:3000/users/me');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Alice' }),
    }));
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization'))
      .toBe('Bearer access');
  });

  it('propage les erreurs API 400/409', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: 'Nom invalide' }, { status: 400 }),
    );
    await expect(updateProfile('')).rejects.toMatchObject({
      status: 400,
      messages: ['Nom invalide'],
    });
  });
});
