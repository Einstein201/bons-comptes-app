import { apiRequest } from './api';

function membersPath(walletId: string): string {
  return `/wallets/${encodeURIComponent(walletId)}/members`;
}

// DELETE /wallets/:walletId/members/me : l'utilisateur authentifié quitte le porte-monnaie.
export async function leaveWallet(walletId: string): Promise<void> {
  await apiRequest(`${membersPath(walletId)}/me`, { method: 'DELETE' });
}

// DELETE /wallets/:walletId/members/:userId : réservé au créateur.
export async function removeMember(walletId: string, userId: string): Promise<void> {
  await apiRequest(`${membersPath(walletId)}/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
