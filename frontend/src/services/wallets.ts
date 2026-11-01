import { apiRequest } from './api';

export type WalletStatus = 'OPEN' | 'CLOSED';

export type Wallet = {
  id: string;
  title: string;
  description: string | null;
  status: WalletStatus;
  createdAt: string;
};

export type CreateWalletInput = {
  title: string;
  description?: string;
};

export type WalletMember = {
  userId: string;
  name: string;
  email: string;
  status: 'INVITED' | 'MEMBER';
  invitedAt: string;
  acceptedAt: string | null;
};

type WalletDetailsPage = {
  wallet: Wallet;
  members: { items: WalletMember[]; nextCursor: string | null };
};

export type WalletDetails = {
  wallet: Wallet;
  members: WalletMember[];
};

const MEMBERS_PAGE_LIMIT = 100;

// POST /wallets n'accepte que title et description : le créateur est l'utilisateur authentifié.
export async function createWallet(input: CreateWalletInput): Promise<Wallet> {
  const response = await apiRequest('/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  return (await response.json()) as Wallet;
}

// Les membres sont paginés : on suit les curseurs jusqu'à la dernière page.
export async function getWalletDetails(walletId: string): Promise<WalletDetails> {
  const path = `/wallets/${encodeURIComponent(walletId)}`;
  const members: WalletMember[] = [];
  let wallet: Wallet | undefined;
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ limit: String(MEMBERS_PAGE_LIMIT) });
    if (cursor) query.set('cursor', cursor);

    const response = await apiRequest(`${path}?${query}`);
    const page = (await response.json()) as WalletDetailsPage;

    wallet = page.wallet;
    members.push(...page.members.items);
    cursor = page.members.nextCursor;
  } while (cursor);

  return { wallet, members };
}