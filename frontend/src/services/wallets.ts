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
