import { ApiError } from '../services/api';

export type MemberAction = 'leave' | 'remove';

export function describeMemberError(error: unknown, action: MemberAction): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 401:
                return 'Votre session a expiré. Reconnectez-vous.';
            case 403:
                return action === 'leave'
                    ? 'Vous ne pouvez pas quitter ce porte-monnaie : le créateur ne peut pas le quitter, et il faut en être membre.'
                    : 'Seul le créateur du porte-monnaie peut retirer un membre.';
            case 404:
                return action === 'leave'
                    ? 'Ce porte-monnaie est introuvable.'
                    : 'Ce membre n’existe plus dans ce porte-monnaie. Rechargez la page.';
            case 409:
                // Historique commun (la clôture est traitée avant, via le statut du porte-monnaie).
                return error.messages.join(' ') ||
                    'Ce porte-monnaie contient des dépenses partagées : l’action est impossible.';
            default:
                return 'Le serveur a rencontré une erreur. Réessayez dans un instant.';
        }
    }

    // fetch rejette avec une TypeError quand le serveur est injoignable.
    if (error instanceof TypeError) {
        return 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.';
    }

    return 'Une erreur inattendue est survenue. Réessayez dans un instant.';
}
