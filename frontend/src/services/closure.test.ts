import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, setAccessToken } from './api';
import { closeWallet, getOptimizedPayments, getWalletBalance } from './closure';

const fetchMock = vi.fn<typeof fetch>();
const date = '2026-11-01T10:00:00.000Z';
const closedWallet = {
  id: 'wallet-1', title: 'Voyage', description: null, status: 'CLOSED',
  createdAt: date, updatedAt: date, closedAt: date,
};
const balance = {
  walletId: 'wallet-1', totalAmount: 10000,
  balances: [
    { userId: 'alice', name: 'Alice', paidAmount: 10000, shareAmount: 5000, balance: 4000 },
    { userId: 'bob', name: 'Bob', paidAmount: 0, shareAmount: 5000, balance: -4000 },
  ],
  transfers: [{ fromUserId: 'bob', toUserId: 'alice', amount: 4000 }],
};
const transfer = {
  fromUserId: 'bob', toUserId: 'alice',
  initialAmount: 5000, remainingAmount: 4000, declarableAmount: 2500,
};
const payments = { walletId: 'wallet-1', transfers: [transfer] };

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

it('clôture par POST authentifié sans inventer de corps de requête', async () => {
  fetchMock.mockResolvedValue(Response.json(closedWallet));
  await expect(closeWallet('wallet-1')).resolves.toEqual(closedWallet);
  expect(fetchMock.mock.calls[0][0].toString()).toBe('http://localhost:3000/wallets/wallet-1/close');
  expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(true);
});

it('conserve les soldes signés et les virements du reste à régler en centimes', async () => {
  fetchMock.mockResolvedValue(Response.json(balance));
  await expect(getWalletBalance('wallet-1')).resolves.toEqual(balance);
  expect(fetchMock.mock.calls[0][0].toString()).toBe('http://localhost:3000/wallets/wallet-1/balance');
});

it('distingue le montant initial, restant dû et encore déclarable', async () => {
  fetchMock.mockResolvedValue(Response.json(payments));
  await expect(getOptimizedPayments('wallet-1')).resolves.toEqual(payments);
  expect(fetchMock.mock.calls[0][0].toString())
    .toBe('http://localhost:3000/wallets/wallet-1/optimized-payments');
});

it('accepte un montant déclarable nul avec un reste encore dû', async () => {
  const body = { walletId: 'wallet-1', transfers: [{ ...transfer, declarableAmount: 0 }] };
  fetchMock.mockResolvedValue(Response.json(body));
  await expect(getOptimizedPayments('wallet-1')).resolves.toEqual(body);
});

it('accepte un bilan sans dépense et un plan sans virement', async () => {
  const body = {
    ...balance, totalAmount: 0, transfers: [],
    balances: balance.balances.map((member) => ({
      ...member, paidAmount: 0, shareAmount: 0, balance: 0,
    })),
  };
  fetchMock.mockResolvedValueOnce(Response.json(body))
    .mockResolvedValueOnce(Response.json({ walletId: 'wallet-1', transfers: [] }));
  await expect(getWalletBalance('wallet-1')).resolves.toEqual(body);
  await expect(getOptimizedPayments('wallet-1'))
    .resolves.toEqual({ walletId: 'wallet-1', transfers: [] });
});

it.each([
  { ...closedWallet, status: 'OPEN' },
  { ...closedWallet, closedAt: null },
  { ...closedWallet, id: 'other' },
])('ne considère pas une clôture invalide comme réussie (%#)', async (body) => {
  fetchMock.mockResolvedValue(Response.json(body));
  await expect(closeWallet('wallet-1')).rejects.toThrow('clôture du porte-monnaie est invalide');
});

it.each([1.5, -1, '4000', Number.MAX_SAFE_INTEGER + 1])(
  'rejette un montant financier invalide : %s', async (amount) => {
    fetchMock.mockResolvedValue(Response.json({
      ...balance, transfers: [{ ...balance.transfers[0], amount }],
    }));
    await expect(getWalletBalance('wallet-1')).rejects.toThrow('bilan du porte-monnaie est invalide');
  },
);

it.each([
  { ...transfer, declarableAmount: 4500 },
  { ...transfer, remainingAmount: 6000 },
  { ...transfer, initialAmount: 1.5 },
  { ...transfer, remainingAmount: -1 },
  { ...transfer, declarableAmount: '2500' },
  { ...transfer, toUserId: 'bob' },
])('rejette un plan de virement invalide (%#)', async (item) => {
  fetchMock.mockResolvedValue(Response.json({ walletId: 'wallet-1', transfers: [item] }));
  await expect(getOptimizedPayments('wallet-1')).rejects.toThrow('virements optimisés est invalide');
});

it.each([getWalletBalance, getOptimizedPayments])(
  'rejette une réponse financière destinée à un autre portefeuille (%#)', async (load) => {
    fetchMock.mockResolvedValue(Response.json({ ...balance, walletId: 'other' }));
    await expect(load('wallet-1')).rejects.toThrow('invalide');
  },
);

it.each([closeWallet, getWalletBalance, getOptimizedPayments])(
  'propage les erreurs HTTP et réseau sans bilan de secours (%#)', async (load) => {
    fetchMock.mockResolvedValue(Response.json({ message: 'Accès refusé' }, { status: 403 }));
    await expect(load('wallet-1')).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockRejectedValue(new TypeError('Network error'));
    await expect(load('wallet-1')).rejects.toThrow('Network error');
  },
);

it('propage HTTP 409 lorsque le bilan du portefeuille ouvert est refusé', async () => {
  fetchMock.mockResolvedValue(Response.json({ message: 'Portefeuille ouvert' }, { status: 409 }));
  await expect(getWalletBalance('wallet-1')).rejects.toMatchObject({ status: 409 });
});
