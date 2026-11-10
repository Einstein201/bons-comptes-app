'use client';

import { useId, useState } from 'react';
import { Button } from './Button';
import { CloseIcon } from './icons';
import { Modal } from './Modal';
import { describeMemberError, type MemberAction } from './memberErrors';
import styles from './MemberActionDialog.module.css';

type MemberActionDialogProps = {
    action: MemberAction;
    // Nom du membre retiré (action « remove »).
    memberName?: string;
    walletTitle: string;
    // Rejette avec l'erreur de l'API : la modale l'affiche et reste ouverte.
    onConfirm: () => Promise<void>;
    onClose: () => void;
};

export function MemberActionDialog({
                                       action,
                                       memberName,
                                       walletTitle,
                                       onConfirm,
                                       onClose,
                                   }: MemberActionDialogProps) {
    const titleId = useId();
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<string>();

    const leaving = action === 'leave';
    const heading = leaving ? 'Quitter le porte-monnaie' : 'Retirer ce membre';

    async function handleConfirm() {
        if (submitting) return;
        setSubmitting(true);
        setFailure(undefined);
        try {
            await onConfirm();
        } catch (error) {
            setFailure(describeMemberError(error, action));
            setSubmitting(false);
        }
    }

    return (
        <Modal onClose={onClose} closeDisabled={submitting}>
            <section
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-busy={submitting}
            >
                <header className={styles.header}>
                    <h2 id={titleId} className={styles.heading}>{heading}</h2>
                    <button
                        type="button"
                        className={styles.close}
                        aria-label="Fermer"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        <CloseIcon />
                    </button>
                </header>

                <div className={styles.body}>
                    {failure ? <p className={styles.alert} role="alert">{failure}</p> : null}
                    <p className={styles.message}>
                        {leaving
                            ? `Vous allez quitter « ${walletTitle} ». Vous n’y aurez plus accès, sauf si le créateur vous invite à nouveau.`
                            : `${memberName} sera retiré(e) de « ${walletTitle} » et n’y aura plus accès, sauf nouvelle invitation.`}
                    </p>
                    <p className={styles.message}>
                        Cette action est impossible s’il existe déjà des dépenses partagées ou des remboursements liés.
                    </p>
                </div>

                <footer className={styles.footer}>
                    <Button variant="ghost" onClick={onClose} disabled={submitting} data-autofocus>
                        Annuler
                    </Button>
                    <Button onClick={handleConfirm} disabled={submitting}>
                        {submitting
                            ? (leaving ? 'Départ…' : 'Retrait…')
                            : (leaving ? 'Quitter le porte-monnaie' : 'Retirer le membre')}
                    </Button>
                </footer>
            </section>
        </Modal>
    );
}
