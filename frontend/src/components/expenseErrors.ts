import { ApiError } from '../services/api';

export type ExpenseAction = 'load' | 'create' | 'delete';

export const CLOSED_WALLET_MESSAGE =
    'Ce porte-monnaie est clôturé : ses dépenses ne peuvent plus être ajoutées ni supprimées.';

export function describeExpenseError(error: unknown, action: ExpenseAction): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 400:
                return action === 'create'
                    ? 'Certaines informations sont invalides. Vérifiez le titre, le montant et la date.'
                    : 'La demande est invalide. Rechargez la page puis réessayez.';
            case 401:
                return 'Votre session a expiré. Reconnectez-vous.';
            case 403:
                if (action === 'delete') return 'Seul le payeur peut supprimer cette dépense.';
                if (action === 'create') {
                    return 'Vous ne pouvez pas ajouter cette dépense : le payeur doit être un membre du porte-monnaie.';
                }
                return 'Vous n’avez pas accès à ce porte-monnaie.';
            case 404:
                return action === 'delete'
                    ? 'Cette dépense n’existe plus. Elle a peut-être déjà été supprimée.'
                    : 'Ce porte-monnaie est introuvable.';
            case 409:
                return CLOSED_WALLET_MESSAGE;
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

export function isClosedWalletError(error: unknown): boolean {
    return error instanceof ApiError && error.status === 409;
}