import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from './api';
import { createExpense, deleteExpense, listExpenses } from './expenses';
import { getWalletDetails } from './wallets';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });
const calledUrl = (index = 0) => fetchMock.mock.calls[index][0].toString();

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

describe('service des dépenses', () => {
    it('liste la première page des dépenses avec le total', async () => {
        const page = {
            items: [{ id: 'e-1', title: 'Courses', amount: 4599, date: '2026-10-25' }],
            nextCursor: 'cursor-2',
            totalAmount: 12345,
        };
        fetchMock.mockResolvedValue(json(page));

        await expect(listExpenses('wallet-1')).resolves.toEqual(page);
        expect(calledUrl()).toBe('http://localhost:3000/wallets/wallet-1/expenses');
        expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization'))
            .toBe('Bearer access');
    });

    it('demande la page suivante avec le curseur et la limite', async () => {
        fetchMock.mockResolvedValue(json({ items: [], nextCursor: null, totalAmount: 0 }));
        await listExpenses('wallet-1', { cursor: 'abc+/=', limit: 20 });
        expect(calledUrl()).toBe(
            'http://localhost:3000/wallets/wallet-1/expenses?limit=20&cursor=abc%2B%2F%3D',
        );
    });

    it('encode l’identifiant du porte-monnaie dans le chemin', async () => {
        fetchMock.mockResolvedValue(json({ items: [], nextCursor: null, totalAmount: 0 }));
        await listExpenses('../users');
        expect(calledUrl()).toBe('http://localhost:3000/wallets/..%2Fusers/expenses');
    });

    it('crée une dépense avec un montant en centimes et le payeur choisi', async () => {
        const input = { title: 'Courses', amount: 4599, date: '2026-10-25', paidById: 'user-2' };
        fetchMock.mockResolvedValue(json({ id: 'e-1', ...input }, 201));

        await createExpense('wallet-1', input);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url.toString()).toBe('http://localhost:3000/wallets/wallet-1/expenses');
        expect(options?.method).toBe('POST');
        expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json');
        expect(JSON.parse(options?.body as string)).toEqual({
            title: 'Courses', amount: 4599, date: '2026-10-25', paidById: 'user-2',
        });
    });

    it('supprime une dépense du porte-monnaie', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
        await expect(deleteExpense('wallet-1', 'e-1')).resolves.toBeUndefined();
        expect(calledUrl()).toBe('http://localhost:3000/wallets/wallet-1/expenses/e-1');
        expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
    });

    it.each([400, 403, 404, 409])('propage une erreur HTTP %i', async (status) => {
        fetchMock.mockResolvedValue(json({ message: 'Refusé' }, status));
        await expect(deleteExpense('wallet-1', 'e-1')).rejects.toMatchObject({
            status, messages: ['Refusé'],
        });
    });
});

describe('détail du porte-monnaie', () => {
    const wallet = { id: 'wallet-1', title: 'Voyage', description: null, status: 'OPEN' };
    const member = (userId: string, status = 'MEMBER') => ({
        userId, name: userId, email: `${userId}@exemple.fr`, status,
    });

    it('récupère tous les membres en suivant les pages', async () => {
        fetchMock
            .mockResolvedValueOnce(json({
                wallet, members: { items: [member('alice')], nextCursor: 'm-1' },
            }))
            .mockResolvedValueOnce(json({
                wallet, members: { items: [member('bob', 'INVITED')], nextCursor: null },
            }));

        const details = await getWalletDetails('wallet-1');

        expect(details.wallet).toEqual(wallet);
        expect(details.members.map((item) => item.userId)).toEqual(['alice', 'bob']);
        expect(calledUrl(0)).toBe('http://localhost:3000/wallets/wallet-1?limit=100');
        expect(calledUrl(1)).toBe('http://localhost:3000/wallets/wallet-1?limit=100&cursor=m-1');
    });
});