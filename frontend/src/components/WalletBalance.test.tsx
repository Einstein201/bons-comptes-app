// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { WalletBalance } from './WalletBalance';

const mocks = vi.hoisted(() => ({
  getWallet: vi.fn(), closeWallet: vi.fn(),
  getWalletBalance: vi.fn(), getOptimizedPayments: vi.fn(),
}));
vi.mock('../services/wallets', () => ({ getWallet: mocks.getWallet }));
vi.mock('../services/closure', () => ({
  closeWallet: mocks.closeWallet,
  getWalletBalance: mocks.getWalletBalance,
  getOptimizedPayments: mocks.getOptimizedPayments,
}));

const detail = {
  wallet: { id: 'wallet-1', title: 'Voyage', status: 'OPEN', isCreator: true },
  members: { items: [], nextCursor: null },
};
const closedDetail = { ...detail, wallet: { ...detail.wallet, status: 'CLOSED' } };
const balance = {
  walletId: 'wallet-1', totalAmount: 10000,
  balances: [
    { userId: 'alice', name: 'Alice', paidAmount: 10000, shareAmount: 5000, balance: 4000 },
    { userId: 'bob', name: 'Bob', paidAmount: 0, shareAmount: 5000, balance: -4000 },
  ],
  transfers: [{ fromUserId: 'bob', toUserId: 'alice', amount: 4000 }],
};
const plan = {
  walletId: 'wallet-1',
  transfers: [{
    fromUserId: 'bob', toUserId: 'alice', initialAmount: 5000,
    remainingAmount: 4000, declarableAmount: 2500,
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getWallet.mockResolvedValue(detail);
  mocks.getWalletBalance.mockResolvedValue(balance);
  mocks.getOptimizedPayments.mockResolvedValue(plan);
});
afterEach(cleanup);

it('réserve le bouton au créateur et ne charge pas le bilan ouvert', async () => {
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByRole('button', { name: 'Clôturer le porte-monnaie' });
  expect(mocks.getWalletBalance).not.toHaveBeenCalled();
  expect(mocks.getOptimizedPayments).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Bilan financier' })).toBeNull();
});

it('ne propose aucune action de clôture à un autre membre', async () => {
  mocks.getWallet.mockResolvedValue({ ...detail, wallet: { ...detail.wallet, isCreator: false } });
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByText('Seul le créateur peut clôturer ce porte-monnaie.');
  expect(screen.queryByRole('button', { name: /clôture|Clôturer/ })).toBeNull();
  expect(mocks.closeWallet).not.toHaveBeenCalled();
});

it('demande une confirmation annulable sans appeler le backend', async () => {
  render(<WalletBalance walletId="wallet-1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clôturer le porte-monnaie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(mocks.closeWallet).not.toHaveBeenCalled();
});

it('clôture puis recharge le détail et les deux routes financières', async () => {
  mocks.getWallet.mockResolvedValueOnce(detail).mockResolvedValue(closedDetail);
  mocks.closeWallet.mockResolvedValue({ status: 'CLOSED' });
  render(<WalletBalance walletId="wallet-1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clôturer le porte-monnaie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
  await screen.findByRole('heading', { name: 'Bilan financier' });
  expect(mocks.closeWallet).toHaveBeenCalledExactlyOnceWith('wallet-1');
  expect(mocks.getWallet).toHaveBeenCalledTimes(2);
  expect(mocks.getWalletBalance).toHaveBeenCalledExactlyOnceWith('wallet-1');
  expect(mocks.getOptimizedPayments).toHaveBeenCalledExactlyOnceWith('wallet-1');
  expect(screen.queryByRole('button', { name: 'Clôturer le porte-monnaie' })).toBeNull();
});

it('affiche les soldes signés et les deux montants distincts pour un membre', async () => {
  mocks.getWallet.mockResolvedValue({
    ...closedDetail, wallet: { ...closedDetail.wallet, isCreator: false },
  });
  render(<WalletBalance walletId="wallet-1" />);
  const table = await screen.findByRole('table');
  expect(within(table).getByText('-40,00 €')).toBeDefined();
  expect(screen.getByText('Reste à régler :').textContent).toContain('40,00');
  expect(screen.getByText('Encore déclarable :').textContent).toContain('25,00');
  expect(screen.getByText('Bob → Alice')).toBeDefined();
});

it('ne confond pas un déclarable nul avec un virement réglé', async () => {
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getOptimizedPayments.mockResolvedValue({
    ...plan, transfers: [{ ...plan.transfers[0], declarableAmount: 0 }],
  });
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByText('Le reste dû est entièrement en attente de validation.');
  expect(screen.queryByText('Tous les comptes sont réglés.')).toBeNull();
});

it('ne présente aucun bilan si une route financière échoue', async () => {
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getOptimizedPayments.mockRejectedValue(new ApiError(403));
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Bilan financier' })).toBeNull();
});

it('rejette des réponses financières incohérentes puis permet de réessayer', async () => {
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getOptimizedPayments.mockResolvedValueOnce({
    ...plan, transfers: [{ ...plan.transfers[0], remainingAmount: 3000 }],
  }).mockResolvedValue(plan);
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('table')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await screen.findByRole('table');
});

it('signale un échec de clôture sans charger de bilan', async () => {
  mocks.closeWallet.mockRejectedValue(new ApiError(409));
  render(<WalletBalance walletId="wallet-1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clôturer le porte-monnaie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
  await screen.findByRole('alert');
  expect(mocks.getWalletBalance).not.toHaveBeenCalled();
});

it('masque le bilan précédent pendant une actualisation qui échoue', async () => {
  mocks.getWallet.mockResolvedValueOnce(closedDetail).mockRejectedValue(new TypeError('Network'));
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('table')).toBeNull();
});

it('refuse une seconde clôture pendant la requête', async () => {
  let resolveClose: (value: unknown) => void = () => {};
  mocks.closeWallet.mockImplementation(() => new Promise((resolve) => { resolveClose = resolve; }));
  mocks.getWallet.mockResolvedValueOnce(detail).mockResolvedValue(closedDetail);
  render(<WalletBalance walletId="wallet-1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clôturer le porte-monnaie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
  const pending = screen.getByRole('button', { name: 'Clôture en cours…' });
  expect(pending.hasAttribute('disabled')).toBe(true);
  fireEvent.click(pending);
  expect(mocks.closeWallet).toHaveBeenCalledTimes(1);
  resolveClose({});
  await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
});

it.each([403, 404, 409, 500])(
  'ne charge aucun bilan lorsque le détail est refusé (HTTP %s)', async (status) => {
    mocks.getWallet.mockRejectedValue(new ApiError(status));
    render(<WalletBalance walletId="wallet-1" />);
    await screen.findByRole('alert');
    expect(mocks.getWalletBalance).not.toHaveBeenCalled();
    expect(mocks.getOptimizedPayments).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Clôturer|Confirmer/ })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  },
);

it('attend les deux réponses avant de présenter le bilan', async () => {
  let resolvePlan!: (value: typeof plan) => void;
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getOptimizedPayments.mockImplementation(() => new Promise((resolve) => {
    resolvePlan = resolve;
  }));
  render(<WalletBalance walletId="wallet-1" />);
  await waitFor(() => expect(mocks.getOptimizedPayments).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status').textContent).toContain('Chargement');
  expect(screen.queryByRole('table')).toBeNull();
  resolvePlan(plan);
  await screen.findByRole('table');
});

it('affiche des comptes réglés uniquement avec des soldes nuls', async () => {
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getWalletBalance.mockResolvedValue({
    ...balance, transfers: [],
    balances: balance.balances.map((member) => ({ ...member, balance: 0 })),
  });
  mocks.getOptimizedPayments.mockResolvedValue({ ...plan, transfers: [] });
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByText('Tous les comptes sont réglés.');
  expect(screen.queryByRole('button', { name: /Clôturer|Confirmer/ })).toBeNull();
});

it('refuse un plan vide lorsque des soldes restent à régler', async () => {
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getWalletBalance.mockResolvedValue({ ...balance, transfers: [] });
  mocks.getOptimizedPayments.mockResolvedValue({ ...plan, transfers: [] });
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Tous les comptes sont réglés.')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
});

it('refuse des virements identiques entre routes mais différents des soldes', async () => {
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getWalletBalance.mockResolvedValue({
    ...balance, transfers: [{ ...balance.transfers[0], amount: 3000 }],
  });
  mocks.getOptimizedPayments.mockResolvedValue({
    ...plan, transfers: [{ ...plan.transfers[0], remainingAmount: 3000 }],
  });
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('table')).toBeNull();
});

it('accepte les paires initiales même lorsqu’un membre reçoit et émet un virement', async () => {
  mocks.getWallet.mockResolvedValue(closedDetail);
  mocks.getWalletBalance.mockResolvedValue({
    walletId: 'wallet-1', totalAmount: 9000,
    balances: [
      { userId: 'alice', name: 'Alice', paidAmount: 7000, shareAmount: 3000, balance: 1000 },
      { userId: 'bob', name: 'Bob', paidAmount: 2000, shareAmount: 3000, balance: 1000 },
      { userId: 'carol', name: 'Carol', paidAmount: 0, shareAmount: 3000, balance: -2000 },
    ],
    transfers: [
      { fromUserId: 'carol', toUserId: 'alice', amount: 2000 },
      { fromUserId: 'alice', toUserId: 'bob', amount: 1000 },
    ],
  });
  mocks.getOptimizedPayments.mockResolvedValue({
    walletId: 'wallet-1',
    transfers: [
      { fromUserId: 'carol', toUserId: 'alice', initialAmount: 3000, remainingAmount: 2000, declarableAmount: 2000 },
      { fromUserId: 'alice', toUserId: 'bob', initialAmount: 1000, remainingAmount: 1000, declarableAmount: 1000 },
    ],
  });
  render(<WalletBalance walletId="wallet-1" />);
  await screen.findByRole('table');
  expect(screen.getByText('Alice → Bob')).toBeDefined();
});

it('confirme la clôture mais masque le bilan si son rechargement échoue', async () => {
  mocks.getWallet.mockResolvedValueOnce(detail).mockResolvedValue(closedDetail);
  mocks.closeWallet.mockResolvedValue({ status: 'CLOSED' });
  mocks.getWalletBalance.mockRejectedValue(new TypeError('Network'));
  render(<WalletBalance walletId="wallet-1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clôturer le porte-monnaie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('status').textContent).toContain('a été clôturé');
  expect(screen.queryByRole('table')).toBeNull();
  expect(mocks.closeWallet).toHaveBeenCalledTimes(1);
});
