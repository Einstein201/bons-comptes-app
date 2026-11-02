import { apiRequest } from './api';
import { isCents, isDateString, isNonEmptyString, isRecord } from './api-contract';

export type RepaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export type Repayment = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: RepaymentStatus;
  createdAt: string;
  paidAt: string | null;
};

export type RepaymentListItem = Omit<Repayment, 'fromUserId' | 'toUserId'> & {
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
  canConfirm: boolean;
  canCancel: boolean;
};

export type RepaymentPage = {
  items: RepaymentListItem[];
  nextCursor: string | null;
};

export type RepaymentQuery = {
  limit?: number;
  cursor?: string;
  status?: RepaymentStatus;
};

export type DeclareRepaymentInput = {
  toUserId: string;
  amount: number;
};

function isRepaymentStatus(value: unknown): value is RepaymentStatus {
  return value === 'PENDING' || value === 'PAID' || value === 'CANCELLED';
}

function isRepayment(value: unknown): value is Repayment {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.fromUserId) &&
    isNonEmptyString(value.toUserId) &&
    value.fromUserId !== value.toUserId &&
    isCents(value.amount) && value.amount > 0 &&
    isRepaymentStatus(value.status) &&
    isDateString(value.createdAt) &&
    (value.paidAt === null || isDateString(value.paidAt));
}

function isRepaymentListItem(value: unknown): value is RepaymentListItem {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isRecord(value.fromUser) &&
    isNonEmptyString(value.fromUser.id) &&
    typeof value.fromUser.name === 'string' &&
    isRecord(value.toUser) &&
    isNonEmptyString(value.toUser.id) &&
    typeof value.toUser.name === 'string' &&
    value.fromUser.id !== value.toUser.id &&
    isCents(value.amount) && value.amount > 0 &&
    isRepaymentStatus(value.status) &&
    isDateString(value.createdAt) &&
    (value.paidAt === null || isDateString(value.paidAt)) &&
    typeof value.canConfirm === 'boolean' &&
    typeof value.canCancel === 'boolean';
}

function isRepaymentPage(value: unknown): value is RepaymentPage {
  return isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isRepaymentListItem) &&
    (value.nextCursor === null || isNonEmptyString(value.nextCursor));
}

function assertRepayment(value: unknown): Repayment {
  if (!isRepayment(value)) {
    throw new Error('La réponse du remboursement est invalide.');
  }
  return value;
}

export async function getRepayments(
  walletId: string,
  query: RepaymentQuery = {},
): Promise<RepaymentPage> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  if (query.status !== undefined) params.set('status', query.status);
  const suffix = params.size ? `?${params}` : '';
  const response = await apiRequest(
    `/wallets/${encodeURIComponent(walletId)}/repayments${suffix}`,
  );
  const body: unknown = await response.json();
  if (!isRepaymentPage(body)) {
    throw new Error('La réponse de la liste des remboursements est invalide.');
  }
  return body;
}

export async function declareRepayment(
  walletId: string,
  input: DeclareRepaymentInput,
): Promise<Repayment> {
  const response = await apiRequest(
    `/wallets/${encodeURIComponent(walletId)}/repayments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return assertRepayment(await response.json());
}

async function changeRepaymentStatus(
  walletId: string,
  repaymentId: string,
  action: 'confirm' | 'cancel',
): Promise<Repayment> {
  const response = await apiRequest(
    `/wallets/${encodeURIComponent(walletId)}/repayments/${encodeURIComponent(repaymentId)}/${action}`,
    { method: 'POST' },
  );
  return assertRepayment(await response.json());
}

export function confirmRepayment(walletId: string, repaymentId: string): Promise<Repayment> {
  return changeRepaymentStatus(walletId, repaymentId, 'confirm');
}

export function cancelRepayment(walletId: string, repaymentId: string): Promise<Repayment> {
  return changeRepaymentStatus(walletId, repaymentId, 'cancel');
}
