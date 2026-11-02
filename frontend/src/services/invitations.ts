import { apiRequest } from './api';
import { isDateString, isNonEmptyString, isRecord } from './api-contract';

export type Invitation = {
  id: string;
  invitedAt: string;
  wallet: {
    id: string;
    title: string;
    description: string | null;
    status: 'OPEN' | 'CLOSED';
  };
};

export type InvitationPage = {
  data: Invitation[];
  nextCursor: string | null;
};

function isInvitation(value: unknown): value is Invitation {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isDateString(value.invitedAt) &&
    isRecord(value.wallet) &&
    isNonEmptyString(value.wallet.id) &&
    typeof value.wallet.title === 'string' &&
    (value.wallet.description === null || typeof value.wallet.description === 'string') &&
    (value.wallet.status === 'OPEN' || value.wallet.status === 'CLOSED');
}

function isInvitationPage(value: unknown): value is InvitationPage {
  return isRecord(value) &&
    Array.isArray(value.data) && value.data.every(isInvitation) &&
    (value.nextCursor === null || isNonEmptyString(value.nextCursor));
}

export async function sendInvitation(walletId: string, email: string): Promise<Invitation> {
  const response = await apiRequest(`/wallets/${encodeURIComponent(walletId)}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body: unknown = await response.json();
  if (!isInvitation(body)) {
    throw new Error("La réponse de l'invitation est invalide.");
  }
  return body;
}

export async function getInvitations(
  query: { limit?: number; cursor?: string } = {},
): Promise<InvitationPage> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const suffix = params.size ? `?${params}` : '';
  const response = await apiRequest(`/invitations${suffix}`);
  const body: unknown = await response.json();
  if (!isInvitationPage(body)) {
    throw new Error('La réponse de la liste des invitations est invalide.');
  }
  return body;
}

// L'identifiant attendu est celui de l'invitation renvoyé par GET /invitations.
export async function acceptInvitation(invitationId: string): Promise<void> {
  const response = await apiRequest(`/invitations/${encodeURIComponent(invitationId)}/accept`, {
    method: 'POST',
  });
  const body: unknown = await response.json();
  if (!isRecord(body) || body.id !== invitationId || body.status !== 'MEMBER') {
    throw new Error("La réponse d'acceptation de l'invitation est invalide.");
  }
}
