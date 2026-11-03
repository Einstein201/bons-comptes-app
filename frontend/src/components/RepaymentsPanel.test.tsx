// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import {
  cancelRepayment,
  confirmRepayment,
  declareRepayment,
  getRepayments,
  type RepaymentListItem,
} from '../services/repayments';
import { RepaymentsPanel } from './RepaymentsPanel';

vi.mock('../services/repayments', () => ({
  cancelRepayment: vi.fn(),
  confirmRepayment: vi.fn(),
  declareRepayment: vi.fn(),
  getRepayments: vi.fn(),
}));

const first: RepaymentListItem = {
  id: 'repayment-1',
  fromUser: { id: 'bob', name: 'Bob' },
  toUser: { id: 'alice', name: 'Alice' },
  amount: 1250,
  status: 'PENDING',
  createdAt: '2026-11-02T10:00:00.000Z',
  paidAt: null,
  canConfirm: true,
  canCancel: false,
};
const second: RepaymentListItem = {
  ...first,
  id: 'repayment-2',
  status: 'PAID',
  paidAt: '2026-11-02T11:00:00.000Z',
  canConfirm: false,
};
const transfers = [{
  fromUserId: 'bob',
  toUserId: 'alice',
  initialAmount: 5000,
  remainingAmount: 4000,
  declarableAmount: 2500,
}];
const financialRefresh = vi.fn<() => Promise<void>>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getRepayments).mockResolvedValue({ items: [first], nextCursor: null });
  financialRefresh.mockResolvedValue();
});

afterEach(cleanup);

function renderPanel(
  options: {
    userId?: string;
    page?: { items: RepaymentListItem[]; nextCursor: string | null };
    transferList?: typeof transfers;
  } = {},
) {
  if (options.page) vi.mocked(getRepayments).mockResolvedValue(options.page);
  return render(
    <RepaymentsPanel
      walletId="wallet-1"
      userId={options.userId ?? 'bob'}
      transfers={options.transferList ?? transfers}
      memberNames={{ alice: 'Alice', bob: 'Bob' }}
      onFinancialRefresh={financialRefresh}
    />,
  );
}

it('affiche les noms, le statut, le montant et les dates du remboursement', async () => {
  renderPanel({ page: { items: [second], nextCursor: null } });

  const row = await screen.findByText('Bob → Alice');
  const item = row.closest('li');
  expect(item).not.toBeNull();
  expect(within(item as HTMLElement).getByText('Payé')).toBeDefined();
  expect(within(item as HTMLElement).getByText('12,50 €')).toBeDefined();
  expect(within(item as HTMLElement).getByText(/Déclaré le/)).toBeDefined();
  expect(within(item as HTMLElement).getByText(/Payé le/)).toBeDefined();
});

it('filtre par statut et navigue dans les pages avec les curseurs API', async () => {
  vi.mocked(getRepayments)
    .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-2' })
    .mockResolvedValueOnce({ items: [second], nextCursor: null })
    .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-2' })
    .mockResolvedValueOnce({ items: [second], nextCursor: null });
  renderPanel();

  await screen.findByText('Bob → Alice');
  fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
  await screen.findByText('Payé');
  expect(getRepayments).toHaveBeenNthCalledWith(2, 'wallet-1', {
    limit: 10,
    cursor: 'cursor-2',
  });

  fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
  await screen.findByText('En attente');
  expect(getRepayments).toHaveBeenNthCalledWith(3, 'wallet-1', {
    limit: 10,
    cursor: undefined,
  });

  fireEvent.change(screen.getByLabelText('Filtrer par statut'), {
    target: { value: 'PAID' },
  });
  await screen.findByText('Payé');
  expect(getRepayments).toHaveBeenLastCalledWith('wallet-1', {
    limit: 10,
    cursor: undefined,
    status: 'PAID',
  });
});

it('montre uniquement les actions autorisées par les indicateurs API', async () => {
  const senderAction = { ...first, id: 'repayment-2', canConfirm: false, canCancel: true };
  vi.mocked(getRepayments).mockResolvedValue({
    items: [first, senderAction, { ...second, id: 'repayment-3', canConfirm: false }],
    nextCursor: null,
  });
  renderPanel();

  await screen.findAllByText('Bob → Alice');
  expect(screen.getAllByRole('button', { name: 'Confirmer le remboursement' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Annuler le remboursement' })).toHaveLength(1);
});

it.each([
  ['émetteur', { canConfirm: false, canCancel: true }, 0, 1],
  ['destinataire', { canConfirm: true, canCancel: false }, 1, 0],
  ['créateur du portefeuille', { canConfirm: true, canCancel: false }, 1, 0],
  ['membre tiers', { canConfirm: false, canCancel: false }, 0, 0],
])('affiche les actions attendues pour le rôle %s', async (_role, flags, confirms, cancels) => {
  renderPanel({
    userId: 'carol',
    page: { items: [{ ...first, ...flags }], nextCursor: null },
  });

  await screen.findByText('Bob → Alice');
  expect(screen.queryAllByRole('button', { name: 'Confirmer le remboursement' })).toHaveLength(confirms);
  expect(screen.queryAllByRole('button', { name: 'Annuler le remboursement' })).toHaveLength(cancels);
});

it('déclare un montant en euros converti en centimes et actualise liste et bilan', async () => {
  vi.mocked(declareRepayment).mockResolvedValue({
    id: 'new',
    fromUserId: 'bob',
    toUserId: 'alice',
    amount: 1234,
    status: 'PENDING',
    createdAt: '2026-11-02T10:00:00.000Z',
    paidAt: null,
  });
  renderPanel();
  await screen.findByText('Bob → Alice');

  fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: '12,34' } });
  fireEvent.click(screen.getByRole('button', { name: 'Déclarer le remboursement' }));

  await screen.findByText('Le remboursement a été déclaré.');
  expect(declareRepayment).toHaveBeenCalledWith('wallet-1', {
    toUserId: 'alice',
    amount: 1234,
  });
  await waitFor(() => expect(getRepayments).toHaveBeenCalledTimes(2));
  expect(financialRefresh).toHaveBeenCalledOnce();
});

it('empêche de déclarer un montant supérieur au déclarable', async () => {
  renderPanel();
  await screen.findByText('Bob → Alice');

  fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: '25,01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Déclarer le remboursement' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Le montant ne peut pas dépasser 25,00');
  expect(declareRepayment).not.toHaveBeenCalled();
});

it('ne propose pas de déclaration à un membre qui ne doit rien', async () => {
  renderPanel({ userId: 'alice' });
  await screen.findByText('Bob → Alice');
  expect(screen.queryByRole('heading', { name: 'Déclarer un remboursement' })).toBeNull();
});

it('confirme le remboursement puis recharge les données financières', async () => {
  vi.mocked(confirmRepayment).mockResolvedValue({
    id: first.id,
    fromUserId: 'bob',
    toUserId: 'alice',
    amount: first.amount,
    status: 'PAID',
    createdAt: first.createdAt,
    paidAt: first.createdAt,
  });
  renderPanel();
  await screen.findByText('Bob → Alice');

  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));

  await screen.findByText('Le remboursement a été confirmé.');
  expect(confirmRepayment).toHaveBeenCalledWith('wallet-1', first.id);
  await waitFor(() => expect(getRepayments).toHaveBeenCalledTimes(2));
  expect(financialRefresh).toHaveBeenCalledOnce();
});

it('annule le remboursement lorsque canCancel est vrai', async () => {
  vi.mocked(getRepayments).mockResolvedValue({
    items: [{ ...first, canConfirm: false, canCancel: true }],
    nextCursor: null,
  });
  vi.mocked(cancelRepayment).mockResolvedValue({
    id: first.id,
    fromUserId: 'bob',
    toUserId: 'alice',
    amount: first.amount,
    status: 'CANCELLED',
    createdAt: first.createdAt,
    paidAt: null,
  });
  renderPanel();
  await screen.findByText('Bob → Alice');

  fireEvent.click(screen.getByRole('button', { name: 'Annuler le remboursement' }));

  await screen.findByText('Le remboursement a été annulé.');
  expect(cancelRepayment).toHaveBeenCalledWith('wallet-1', first.id);
  await waitFor(() => expect(getRepayments).toHaveBeenCalledTimes(2));
});

it('signale un conflit 409 sans afficher un succès et actualise les données', async () => {
  vi.mocked(confirmRepayment).mockRejectedValue(new ApiError(409));
  renderPanel();
  await screen.findByText('Bob → Alice');

  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));

  expect((await screen.findByRole('alert')).textContent).toContain('L’action n’a pas été confirmée');
  expect(screen.queryByText('Le remboursement a été confirmé.')).toBeNull();
  await waitFor(() => expect(getRepayments).toHaveBeenCalledTimes(2));
  expect(financialRefresh).toHaveBeenCalledOnce();
});

it('ne présente pas une confirmation si le rechargement du bilan échoue', async () => {
  vi.mocked(declareRepayment).mockResolvedValue({
    id: 'new',
    fromUserId: 'bob',
    toUserId: 'alice',
    amount: 100,
    status: 'PENDING',
    createdAt: first.createdAt,
    paidAt: null,
  });
  financialRefresh.mockRejectedValue(new Error('refresh failed'));
  renderPanel();
  await screen.findByText('Bob → Alice');
  fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: '1,00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Déclarer le remboursement' }));

  expect((await screen.findByRole('alert')).textContent).toContain('L’action a été enregistrée');
  expect(await screen.findByText('Le remboursement a été déclaré.')).toBeDefined();
});
