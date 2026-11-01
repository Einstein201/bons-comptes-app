import { apiRequest } from './api';

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

// POST /wallets n'accepte que title et description : le créateur est l'utilisateur authentifié.
export async function createWallet(input: CreateWalletInput): Promise<Wallet> {
  const response = await apiRequest('/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  return (await response.json()) as Wallet;
}

export type WalletSection = 'open' | 'closed' | 'invitations';

export type WalletListItem = {
  id: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  creatorName: string;
  isCreator: boolean;
};

export type InvitationItem = WalletListItem & { invitedAt: string };

export type WalletPage<Item = WalletListItem> = {
  items: Item[];
  nextCursor: string | null;
  total: number;
};

export type WalletLists = {
  open: WalletPage;
  closed: WalletPage;
  invitations: WalletPage<InvitationItem>;
};

const CURSOR_PARAMS: Record<WalletSection, string> = {
  open: 'openCursor',
  closed: 'closedCursor',
  invitations: 'invitationsCursor',
};

export const DEFAULT_PAGE_SIZE = 10;

// Chaque section a son curseur : en n'envoyant que celui de la section visée, les autres restent à leur première page.
export async function listWallets(
  options: { section?: WalletSection; cursor?: string; limit?: number } = {},
): Promise<WalletLists> {
  const { section, cursor, limit = DEFAULT_PAGE_SIZE } = options;
  const params = new URLSearchParams({ limit: String(limit) });
  if (section && cursor) params.set(CURSOR_PARAMS[section], cursor);

  const response = await apiRequest(`/wallets?${params}`);
  return (await response.json()) as WalletLists;
}
