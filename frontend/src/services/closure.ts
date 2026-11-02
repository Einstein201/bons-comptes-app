import { apiRequest } from './api';
import { isCents, isDateString, isNonEmptyString, isRecord } from './api-contract';

export type ClosedWallet = {
  id: string;
  title: string;
  description: string | null;
  status: 'CLOSED';
  createdAt: string;
  updatedAt: string;
  closedAt: string;
};

export type MemberBalance = {
  userId: string;
  name: string;
  paidAmount: number;
  shareAmount: number;
  balance: number;
};

export type BalanceTransfer = {
  fromUserId: string;
  toUserId: string;
  amount: number;
};

export type WalletBalance = {
  walletId: string;
  totalAmount: number;
  balances: MemberBalance[];
  transfers: BalanceTransfer[];
};

export type OptimizedTransfer = {
  fromUserId: string;
  toUserId: string;
  initialAmount: number;
  remainingAmount: number;
  declarableAmount: number;
};

export type OptimizedPayments = {
  walletId: string;
  transfers: OptimizedTransfer[];
};

function isClosedWallet(value: unknown, walletId: string): value is ClosedWallet {
  return isRecord(value) && value.id === walletId &&
    typeof value.title === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    value.status === 'CLOSED' &&
    isDateString(value.createdAt) && isDateString(value.updatedAt) &&
    isDateString(value.closedAt);
}

function isMemberBalance(value: unknown): value is MemberBalance {
  return isRecord(value) && isNonEmptyString(value.userId) &&
    typeof value.name === 'string' &&
    isCents(value.paidAmount) && isCents(value.shareAmount) &&
    typeof value.balance === 'number' && Number.isSafeInteger(value.balance);
}

function isTransferPair(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.fromUserId) && isNonEmptyString(value.toUserId) &&
    value.fromUserId !== value.toUserId;
}

function isBalanceTransfer(value: unknown): value is BalanceTransfer {
  return isRecord(value) && isTransferPair(value) &&
    isCents(value.amount) && value.amount > 0;
}

function isOptimizedTransfer(value: unknown): value is OptimizedTransfer {
  return isRecord(value) && isTransferPair(value) &&
    isCents(value.initialAmount) && isCents(value.remainingAmount) &&
    isCents(value.declarableAmount) && value.remainingAmount > 0 &&
    value.declarableAmount <= value.remainingAmount &&
    value.remainingAmount <= value.initialAmount;
}

function isWalletBalance(value: unknown, walletId: string): value is WalletBalance {
  return isRecord(value) && value.walletId === walletId &&
    isCents(value.totalAmount) &&
    Array.isArray(value.balances) && value.balances.every(isMemberBalance) &&
    Array.isArray(value.transfers) && value.transfers.every(isBalanceTransfer);
}

function isOptimizedPayments(value: unknown, walletId: string): value is OptimizedPayments {
  return isRecord(value) && value.walletId === walletId &&
    Array.isArray(value.transfers) && value.transfers.every(isOptimizedTransfer);
}

export async function closeWallet(walletId: string): Promise<ClosedWallet> {
  const response = await apiRequest(`/wallets/${encodeURIComponent(walletId)}/close`, {
    method: 'POST',
  });
  const body: unknown = await response.json();
  if (!isClosedWallet(body, walletId)) {
    throw new Error('La réponse de clôture du porte-monnaie est invalide.');
  }
  return body;
}

export async function getWalletBalance(walletId: string): Promise<WalletBalance> {
  const response = await apiRequest(`/wallets/${encodeURIComponent(walletId)}/balance`);
  const body: unknown = await response.json();
  if (!isWalletBalance(body, walletId)) {
    throw new Error('La réponse du bilan du porte-monnaie est invalide.');
  }
  return body;
}

export async function getOptimizedPayments(walletId: string): Promise<OptimizedPayments> {
  const response = await apiRequest(`/wallets/${encodeURIComponent(walletId)}/optimized-payments`);
  const body: unknown = await response.json();
  if (!isOptimizedPayments(body, walletId)) {
    throw new Error('La réponse des virements optimisés est invalide.');
  }
  return body;
}
