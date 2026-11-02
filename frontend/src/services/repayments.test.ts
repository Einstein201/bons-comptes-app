import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, setAccessToken } from './api';
import {
  cancelRepayment,
  confirmRepayment,
  declareRepayment,
  getRepayments,
} from './repayments';

const fetchMock = vi.fn<typeof fetch>();
const timestamp = '2026-11-02T10:00:00.000Z';
const item = {
  id: 'repayment-1',
  fromUser: { id: 'debtor-1', name: 'Bob' },
  toUser: { id: 'creditor-1', name: 'Alice' },
  amount: 2500,
  status: 'PENDING',
  createdAt: timestamp,
  paidAt: null,
  canConfirm: true,
  canCancel: false,
};
const repayment = {
  id: 'repayment-1',
  fromUserId: 'debtor-1',
  toUserId: 'creditor-1',
  amount: 2500,
  status: 'PENDING',
  createdAt: timestamp,
  paidAt: null,
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

it('charge les remboursements avec filtres et curseur', async () => {
  const page = { items: [item], nextCursor: 'next-page' };
  fetchMock.mockResolvedValue(Response.json(page));

  await expect(getRepayments('wallet/1', {
    limit: 10,
    cursor: 'cursor-value',
    status: 'PENDING',
  })).resolves.toEqual(page);

  const [url, options] = fetchMock.mock.calls[0];
  expect(url.toString()).toBe(
    'http://localhost:3000/wallets/wallet%2F1/repayments?limit=10&cursor=cursor-value&status=PENDING',
  );
  expect(options?.method).toBeUndefined();
  expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer access');
});

it('déclare un remboursement en centimes avec les données fournies', async () => {
  fetchMock.mockResolvedValue(Response.json(repayment, { status: 201 }));

  await expect(declareRepayment('wallet-1', {
    toUserId: 'creditor-1',
    amount: 2500,
  })).resolves.toEqual(repayment);

  const [url, options] = fetchMock.mock.calls[0];
  expect(url.toString()).toBe('http://localhost:3000/wallets/wallet-1/repayments');
  expect(options?.method).toBe('POST');
  expect(JSON.parse(String(options?.body))).toEqual({
    toUserId: 'creditor-1',
    amount: 2500,
  });
});

it.each([
  ['confirmation', confirmRepayment, 'confirm', 'PAID'],
  ['annulation', cancelRepayment, 'cancel', 'CANCELLED'],
] as const)('envoie une demande de %s authentifiée', async (_label, action, path, status) => {
  fetchMock.mockResolvedValue(Response.json({ ...repayment, status }));

  await expect(action('wallet-1', 'repayment-1')).resolves.toMatchObject({ status });

  expect(fetchMock.mock.calls[0][0].toString())
    .toBe(`http://localhost:3000/wallets/wallet-1/repayments/repayment-1/${path}`);
  expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
});

it.each([
  { ...item, amount: 1.5 },
  { ...item, status: 'UNKNOWN' },
  { ...item, fromUser: { id: 'same-user', name: 'Bob' }, toUser: { id: 'same-user', name: 'Bob' } },
  { ...item, canConfirm: undefined },
])('rejette une réponse de liste invalide (%#)', async (invalidItem) => {
  fetchMock.mockResolvedValue(Response.json({ items: [invalidItem], nextCursor: null }));
  await expect(getRepayments('wallet-1')).rejects.toThrow('liste des remboursements est invalide');
});

it('rejette une réponse de mutation invalide', async () => {
  fetchMock.mockResolvedValue(Response.json({ ...repayment, amount: -1 }));
  await expect(declareRepayment('wallet-1', {
    toUserId: 'creditor-1',
    amount: 2500,
  })).rejects.toThrow('réponse du remboursement est invalide');
});

it('propage les erreurs API, dont les conflits HTTP 409', async () => {
  fetchMock.mockResolvedValue(Response.json({ message: 'Dette modifiée' }, { status: 409 }));
  await expect(confirmRepayment('wallet-1', 'repayment-1'))
    .rejects.toBeInstanceOf(ApiError);
  await expect(confirmRepayment('wallet-1', 'repayment-1'))
    .rejects.toMatchObject({ status: 409 });
});
