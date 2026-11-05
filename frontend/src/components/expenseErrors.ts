import { ApiError } from '../services/api';

export type ExpenseAction = 'load' | 'create' | 'update' | 'delete';

export const CLOSED_WALLET_MESSAGE =
    'Ce porte-monnaie est clôturé : ses dépenses ne peuvent plus être ajoutées, modifiées ni supprimées.';

export const SPLIT_LOCKED_MESSAGE =
    'Le montant ne peut plus être modifié : cette dépense a déjà une répartition.';

export function describeExpenseError(error: unknown, action: ExpenseAction): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 400:
                if (action === 'create') {
                    return 'Certaines informations sont invalides. Vérifiez le titre, le montant et la date.';
                }
                if (action === 'update') {
                    return 'Certaines informations sont invalides. Vérifiez le titre et le montant.';
                }
                return 'La demande est invalide. Rechargez la page puis réessayez.';
            case 401:
                return 'Votre session a expiré. Reconnectez-vous.';
            case 403:
                if (action === 'delete') return 'Seul le payeur peut supprimer cette dépense.';
                if (action === 'update') return 'Seul le payeur peut modifier cette dépense.';
                if (action === 'create') {
                    return 'Vous ne pouvez pas ajouter cette dépense : le payeur doit être un membre du porte-monnaie.';
                }
                return 'Vous n’avez pas accès à ce porte-monnaie.';
            case 404:
                if (action === 'delete') {
                    return 'Cette dépense n’existe plus. Elle a peut-être déjà été supprimée.';
                }
                if (action === 'update') {
                    return 'Cette dépense ou ce porte-monnaie est introuvable. Rechargez la page.';
                }
                return 'Ce porte-monnaie est introuvable.';
            case 409:
                return isSplitLockedError(error) ? SPLIT_LOCKED_MESSAGE : CLOSED_WALLET_MESSAGE;
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

// À la modification, un 409 signifie aussi « montant verrouillé par la répartition » :
// seul le message du serveur permet de le distinguer d'une clôture.
export function isSplitLockedError(error: unknown): boolean {
    return (
        error instanceof ApiError &&
        error.status === 409 &&
        error.messages.some((message) => /répartition/i.test(message))
    );
}

export function isClosedWalletError(error: unknown): boolean {
    return error instanceof ApiError && error.status === 409 && !isSplitLockedError(error);
}