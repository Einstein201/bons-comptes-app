import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from './api';
import { leaveWallet, removeMember } from './memberships';

const fetchMock = vi.fn<typeof fetch>();

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

describe('service des membres', () => {
    it('quitte un porte-monnaie avec DELETE /members/me', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

        await expect(leaveWallet('wallet-1')).resolves.toBeUndefined();

        const [url, options] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('http://localhost:3000/wallets/wallet-1/members/me');
        expect(options?.method).toBe('DELETE');
        expect(new Headers(options?.headers).has('Authorization')).toBe(true);
    });

    it('retire un membre avec DELETE /members/:userId', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

        await expect(removeMember('wallet-1', 'user-2')).resolves.toBeUndefined();

        const [url, options] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('http://localhost:3000/wallets/wallet-1/members/user-2');
        expect(options?.method).toBe('DELETE');
    });

    it('encode les identifiants dans le chemin', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

        await removeMember('w/1', '../me');

        expect(String(fetchMock.mock.calls[0][0]))
            .toBe('http://localhost:3000/wallets/w%2F1/members/..%2Fme');
    });

    it.each([403, 404, 409])('propage une erreur HTTP %i avec le message de l’API', async (status) => {
        // Une Response ne se lit qu'une fois : on en fournit une neuve à chaque appel.
        fetchMock.mockImplementation(async () => Response.json({ message: 'Refusé' }, { status }));

        await expect(leaveWallet('wallet-1')).rejects.toMatchObject({ status, messages: ['Refusé'] });
        await expect(removeMember('wallet-1', 'user-2')).rejects.toMatchObject({ status, messages: ['Refusé'] });
    });
});
