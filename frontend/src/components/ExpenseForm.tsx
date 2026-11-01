'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { ApiError } from '../services/api';
import { createExpense, type Expense } from '../services/expenses';
import { todayIsoDate } from '../utils/dates';
import { parseAmountToCents } from '../utils/money';
import { Button } from './Button';
import { Field } from './Field';
import { CloseIcon } from './icons';
import { describeExpenseError, isClosedWalletError } from './expenseErrors';
import styles from './ExpenseForm.module.css';

const TITLE_MAX_LENGTH = 100;

export type Payer = { userId: string; name: string };

type ExpenseFormProps = {
    walletId: string;
    payers: Payer[];
    currentUserId: string | undefined;
    onCreated: (expense: Expense) => void;
    onClose: () => void;
    // 409 : le porte-monnaie a été clôturé entre-temps.
    onWalletClosed: () => void;
};

type FieldErrors = { title?: string; amount?: string; date?: string };

function validate(title: string, amount: string, date: string): FieldErrors {
    const errors: FieldErrors = {};
    if (title.trim() === '') {
        errors.title = 'La description est obligatoire.';
    }
    if (parseAmountToCents(amount) === null) {
        errors.amount = 'Saisissez un montant positif avec 2 décimales au maximum (ex. 12,50).';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.date = 'Choisissez une date.';
    }
    return errors;
}

export function ExpenseForm({
                                walletId,
                                payers,
                                currentUserId,
                                onCreated,
                                onClose,
                                onWalletClosed,
                            }: ExpenseFormProps) {
    const titleId = useId();
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(() => todayIsoDate());
    const [paidById, setPaidById] = useState(currentUserId ?? payers[0]?.userId ?? '');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [failure, setFailure] = useState<string>();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape' && !submitting) onClose();
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, submitting]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting) return;

        const fieldErrors = validate(title, amount, date);
        setErrors(fieldErrors);
        setFailure(undefined);
        if (Object.keys(fieldErrors).length > 0) return;

        setSubmitting(true);
        try {
            const expense = await createExpense(walletId, {
                title: title.trim(),
                amount: parseAmountToCents(amount)!,
                date,
                paidById,
            });
            onCreated(expense);
        } catch (error) {
            if (!(error instanceof ApiError) && !(error instanceof TypeError)) {
                console.error(error);
            }
            if (isClosedWalletError(error)) {
                onWalletClosed();
                return;
            }
            setFailure(describeExpenseError(error, 'create'));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className={styles.overlay}>
            <form
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onSubmit={handleSubmit}
                noValidate
                aria-busy={submitting}
            >
                <header className={styles.header}>
                    <h2 id={titleId} className={styles.heading}>Ajouter une dépense</h2>
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

                    <Field label="Description" hint="ex : Billets de train" error={errors.title}>
                        {(control) => (
                            <input
                                {...control}
                                type="text"
                                name="title"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="Billets de train"
                                maxLength={TITLE_MAX_LENGTH}
                                autoComplete="off"
                                aria-required="true"
                                readOnly={submitting}
                                autoFocus
                            />
                        )}
                    </Field>

                    <div className={styles.row}>
                        <Field label="Montant (€)" error={errors.amount}>
                            {(control) => (
                                <div className={styles.amountWrapper}>
                                    <input
                                        {...control}
                                        type="text"
                                        inputMode="decimal"
                                        name="amount"
                                        value={amount}
                                        onChange={(event) => setAmount(event.target.value)}
                                        placeholder="0,00"
                                        autoComplete="off"
                                        aria-required="true"
                                        readOnly={submitting}
                                    />
                                    <span className={styles.currency} aria-hidden="true">€</span>
                                </div>
                            )}
                        </Field>

                        <Field label="Date" error={errors.date}>
                            {(control) => (
                                <input
                                    {...control}
                                    type="date"
                                    name="date"
                                    value={date}
                                    onChange={(event) => setDate(event.target.value)}
                                    aria-required="true"
                                    readOnly={submitting}
                                />
                            )}
                        </Field>
                    </div>

                    <Field label="Payé par">
                        {(control) => (
                            <select
                                {...control}
                                name="paidById"
                                value={paidById}
                                onChange={(event) => setPaidById(event.target.value)}
                                disabled={submitting}
                            >
                                {payers.map((payer) => (
                                    <option key={payer.userId} value={payer.userId}>
                                        {payer.userId === currentUserId ? 'Vous' : payer.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </Field>
                </div>

                <footer className={styles.footer}>
                    <Button variant="ghost" onClick={onClose} disabled={submitting}>
                        Annuler
                    </Button>
                    <Button type="submit" disabled={submitting}>
                        {submitting ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                </footer>
            </form>
        </div>
    );
}