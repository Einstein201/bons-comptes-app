import { apiRequest } from './api';
import { isDateString, isNonEmptyString, isRecord } from './api-contract';

export type Wallet = {
  id: string;
  title: string;
  description: string | null;
  status: 'OPEN';
  createdAt: string;
};

export type CreateWalletInput = {
  title: string;
  description?: string;
};

export type WalletDetails = {
  wallet: Omit<Wallet, 'status'> & {
    status: 'OPEN' | 'CLOSED';
    isCreator: boolean;
  };
  members: {
    items: WalletMember[];
    nextCursor: string | null;
  };
};

export type WalletMember = {
  userId: string;
  name: string;
  email: string;
  status: 'INVITED' | 'MEMBER';
  invitedAt: string;
  acceptedAt: string | null;
};

function isWalletMember(value: unknown): value is WalletMember {
  return isRecord(value) &&
    isNonEmptyString(value.userId) &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    (value.status === 'INVITED' || value.status === 'MEMBER') &&
    isDateString(value.invitedAt) &&
    (value.acceptedAt === null || isDateString(value.acceptedAt));
}

function isWalletDetails(value: unknown, walletId: string): value is WalletDetails {
  if (!isRecord(value) || !isRecord(value.wallet) || !isRecord(value.members)) {
    return false;
  }
  const { wallet, members } = value;
  return wallet.id === walletId &&
    typeof wallet.title === 'string' &&
    (wallet.description === null || typeof wallet.description === 'string') &&
    (wallet.status === 'OPEN' || wallet.status === 'CLOSED') &&
    typeof wallet.isCreator === 'boolean' &&
    isDateString(wallet.createdAt) &&
    Array.isArray(members.items) && members.items.every(isWalletMember) &&
    (members.nextCursor === null || isNonEmptyString(members.nextCursor));
}

export async function getWallet(
  walletId: string,
  query: { limit?: number; cursor?: string } = {},
): Promise<WalletDetails> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const suffix = params.size ? `?${params}` : '';
  const response = await apiRequest(`/wallets/${encodeURIComponent(walletId)}${suffix}`);
  const body: unknown = await response.json();
  if (!isWalletDetails(body, walletId)) {
    throw new Error('La réponse du détail du porte-monnaie est invalide.');
  }
  return body;
}

// POST /wallets n'accepte que title et description : le créateur est l'utilisateur authentifié.
export async function createWallet(input: CreateWalletInput): Promise<Wallet> {
  const response = await apiRequest('/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  return (await response.json()) as Wallet;
}
