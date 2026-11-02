import { ApiError } from '../services/api';

export type InvitationAction = 'load' | 'send' | 'accept';

function mentions(error: ApiError, word: string): boolean {
  return error.messages.some((message) => message.toLowerCase().includes(word));
}

export function describeInvitationError(error: unknown, action: InvitationAction): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return action === 'send'
          ? 'Adresse email invalide, ou vous ne pouvez pas vous inviter vous-même.'
          : 'La demande est invalide. Rechargez la page puis réessayez.';
      case 401:
        return 'Votre session a expiré. Reconnectez-vous.';
      case 403:
        if (action === 'send') return 'Seul le créateur du porte-monnaie peut inviter un utilisateur.';
        if (action === 'accept') return 'Cette invitation ne vous est pas destinée.';
        return 'Vous n’avez pas accès à cette ressource.';
      case 404:
        if (action === 'send') {
          return mentions(error, 'porte-monnaie')
            ? 'Ce porte-monnaie est introuvable.'
            : 'Aucun utilisateur inscrit ne correspond à cette adresse email.';
        }
        return 'Cette invitation est introuvable. Elle a peut-être été retirée.';
      case 409:
        if (mentions(error, 'fermé')) return 'Ce porte-monnaie est clôturé : cette action n’est plus possible.';
        return action === 'send'
          ? 'Cet utilisateur est déjà invité ou membre de ce porte-monnaie.'
          : 'Cette invitation a déjà été traitée.';
      default:
        return 'Le serveur a rencontré une erreur. Réessayez dans un instant.';
    }
  }

  if (error instanceof TypeError) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.';
  }

  return 'Une erreur inattendue est survenue. Réessayez dans un instant.';
}
