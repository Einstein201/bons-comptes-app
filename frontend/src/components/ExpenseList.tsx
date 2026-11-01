'use client';

import { useState } from 'react';
import type { Expense } from '../services/expenses';
import { dayOfMonth, monthLabel, shortWeekday } from '../utils/dates';
import { formatCents } from '../utils/money';
import { Button } from './Button';
import { ReceiptIcon, TrashIcon } from './icons';
import styles from './ExpenseList.module.css';

type ExpenseListProps = {
    expenses: Expense[];
    currentUserId: string | undefined;
    canEdit: boolean;
    deletingId: string | undefined;
    onDelete: (expense: Expense) => void;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
};

type MonthGroup = { label: string; expenses: Expense[] };

// Les dépenses arrivent déjà triées : on les regroupe par mois sans changer l'ordre.
function groupByMonth(expenses: Expense[]): MonthGroup[] {
    const groups: MonthGroup[] = [];
    for (const expense of expenses) {
        const label = monthLabel(expense.date);
        const lastGroup = groups[groups.length - 1];
        if (lastGroup?.label === label) {
            lastGroup.expenses.push(expense);
        } else {
            groups.push({ label, expenses: [expense] });
        }
    }
    return groups;
}

export function ExpenseList({
                                expenses,
                                currentUserId,
                                canEdit,
                                deletingId,
                                onDelete,
                                hasMore,
                                loadingMore,
                                onLoadMore,
                            }: ExpenseListProps) {
    const [confirmingId, setConfirmingId] = useState<string>();

    if (expenses.length === 0) {
        return (
            <section className={styles.card}>
                <p className={styles.empty}>Aucune dépense pour le moment.</p>
            </section>
        );
    }

    return (
        <section className={styles.card} aria-label="Dépenses">
            {groupByMonth(expenses).map((group) => (
                <div key={group.label}>
                    <h2 className={styles.month}>{group.label}</h2>
                    <ul className={styles.list}>
                        {group.expenses.map((expense) => {
                            const paidByMe = expense.paidBy.id === currentUserId;
                            // Le serveur vérifie aussi ces droits (403 / 409).
                            const canDelete = canEdit && paidByMe;
                            const deleting = deletingId === expense.id;

                            return (
                                <li key={expense.id} className={styles.row}>
                                    <div className={styles.date}>
                                        <span className={styles.day}>{dayOfMonth(expense.date)}</span>
                                        <span className={styles.weekday}>{shortWeekday(expense.date)}</span>
                                    </div>
                                    <span className={styles.icon}>
                    <ReceiptIcon />
                  </span>
                                    <div className={styles.details}>
                                        <p className={styles.title}>{expense.title}</p>
                                        <p className={styles.payer}>
                                            Payé par {paidByMe ? 'vous' : expense.paidBy.name}
                                        </p>
                                    </div>
                                    <p className={styles.amount}>{formatCents(expense.amount)}</p>

                                    {/* Garde les montants alignés quand il n'y a pas de bouton. */}
                                    {canEdit && !paidByMe ? <span className={styles.deleteSlot} /> : null}

                                    {canDelete && confirmingId !== expense.id ? (
                                        <button
                                            type="button"
                                            className={styles.delete}
                                            aria-label={`Supprimer la dépense « ${expense.title} »`}
                                            onClick={() => setConfirmingId(expense.id)}
                                            disabled={deleting}
                                        >
                                            <TrashIcon />
                                        </button>
                                    ) : null}

                                    {canDelete && confirmingId === expense.id ? (
                                        <div className={styles.confirm}>
                                            <Button
                                                variant="ghost"
                                                className={styles.smallButton}
                                                onClick={() => setConfirmingId(undefined)}
                                                disabled={deleting}
                                            >
                                                Annuler
                                            </Button>
                                            <Button
                                                className={styles.smallButton}
                                                onClick={() => onDelete(expense)}
                                                disabled={deleting}
                                            >
                                                {deleting ? 'Suppression…' : 'Supprimer'}
                                            </Button>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}

            {hasMore ? (
                <div className={styles.more}>
                    <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
                        {loadingMore ? 'Chargement…' : 'Afficher plus de dépenses'}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}