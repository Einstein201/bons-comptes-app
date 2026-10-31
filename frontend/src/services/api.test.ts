import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError, apiRequest, getAccessToken, refreshSession,
  setAccessToken, subscribeSession,
} from './api';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });

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

describe('client API', () => {
  it('injecte le token en conservant les autres en-têtes', async () => {
    setAccessToken('access');
    fetchMock.mockResolvedValue(json({}));
    await apiRequest('/wallets', { headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('ne transmet pas le token aux routes publiques et ne les renouvelle pas', async () => {
    setAccessToken('access');
    fetchMock.mockResolvedValue(json({ message: 'Identifiants incorrects' }, 401));
    await expect(apiRequest('/auth/login', undefined, false)).rejects.toMatchObject({
      status: 401, messages: ['Identifiants incorrects'],
    });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renouvelle un token rejeté et rejoue une seule fois la requête', async () => {
    setAccessToken('expired');
    fetchMock.mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(json({ items: [] }));
    await apiRequest('/wallets');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0].toString()).toBe('http://localhost:3000/auth/refresh');
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe('include');
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer fresh');
  });

  it('efface une session invalide sans boucle de renouvellement', async () => {
    setAccessToken('expired');
    fetchMock.mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(json({}, 401));
    await expect(apiRequest('/wallets')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBeNull();
  });

  it('partage le renouvellement entre les requêtes concurrentes sans token', async () => {
    fetchMock.mockResolvedValueOnce(json({ accessToken: 'fresh' }))
      .mockImplementation(async () => json({}));
    await Promise.all([apiRequest('/wallets'), apiRequest('/auth/me')]);
    expect(fetchMock.mock.calls.filter(([url]) =>
      url.toString().endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('partage le renouvellement entre deux réponses 401 concurrentes', async () => {
    setAccessToken('expired');
    fetchMock.mockImplementation(async (url, options) => {
      if (url.toString().endsWith('/auth/refresh')) {
        return json({ accessToken: 'fresh' });
      }
      return new Headers(options?.headers).get('Authorization') === 'Bearer expired'
        ? json({}, 401)
        : json({});
    });
    await Promise.all([apiRequest('/wallets'), apiRequest('/auth/me')]);
    expect(fetchMock.mock.calls.filter(([url]) =>
      url.toString().endsWith('/auth/refresh'))).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ne renouvelle pas la session sur une erreur 403', async () => {
    setAccessToken('access');
    fetchMock.mockResolvedValue(json({}, 403));
    await expect(apiRequest('/wallets')).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('access');
  });

  it('refuse les appels vers une origine extérieure', async () => {
    setAccessToken('secret');
    await expect(apiRequest('https://example.com/')).rejects.toThrow('backend configuré');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('conserve les erreurs de validation NestJS', async () => {
    fetchMock.mockResolvedValue(json({ message: ['email invalide', 'nom requis'] }, 400));
    await expect(apiRequest('/users', undefined, false)).rejects.toMatchObject({
      status: 400, messages: ['email invalide', 'nom requis'],
    });
  });

  it('conserve le statut des erreurs sans corps JSON', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    await expect(apiRequest('/users', undefined, false)).rejects.toMatchObject({
      status: 502, messages: [],
    });
  });
});

describe('renouvellement de session', () => {
  it('propage les erreurs réseau sans les transformer en déconnexion', async () => {
    setAccessToken('existing');
    fetchMock.mockRejectedValue(new TypeError('Network error'));
    await expect(refreshSession()).rejects.toThrow('Network error');
    expect(getAccessToken()).toBe('existing');
  });

  it('refuse une réponse sans token valide', async () => {
    fetchMock.mockResolvedValue(json({ accessToken: '' }));
    await expect(refreshSession()).rejects.toThrow('token valide');
    expect(getAccessToken()).toBeNull();
  });

  it('efface le token lorsque le refresh est rejeté', async () => {
    setAccessToken('expired');
    fetchMock.mockResolvedValue(json({}, 401));
    await expect(refreshSession()).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
  });

  it('ne restaure pas une session effacée pendant le renouvellement', async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveResponse = resolve; }));
    const pending = refreshSession();
    setAccessToken(null);
    resolveResponse(json({ accessToken: 'obsolete' }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
  });

  it('notifie les changements de session et permet le désabonnement', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    setAccessToken('access');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setAccessToken(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
