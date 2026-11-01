'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { deleteExpense, listExpenses, type Expense } from '../services/expenses';
import { getWalletDetails, type Wallet, type WalletMember } from '../services/wallets';
import { formatCents } from '../utils/money';
import { Button } from './Button';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';
import { describeExpenseError, isClosedWalletError } from './expenseErrors';
import { ChevronLeftIcon, LockIcon, PlusIcon } from './icons';
import styles from './WalletDetail.module.css';

type Notice = { kind: 'success' | 'error'; message: string };

// Même ordre que le backend : date la plus récente d'abord, puis identifiant décroissant.
function compareExpenses(a: Expense, b: Expense): number {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
}

// Une dépense ajoutée localement peut revenir dans la page suivante : la Map évite les doublons.
export function mergeExpenses(current: Expense[], incoming: Expense[]): Expense[] {
    const byId = new Map<string, Expense>();
    for (const expense of [...current, ...incoming]) {
        byId.set(expense.id, expense);
    }
    return [...byId.values()].sort(compareExpenses);
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');
}

export function WalletDetail({ walletId }: { walletId: string }) {
    const { user } = useAuth();
    const currentUserId = user?.userId;

    const [wallet, setWallet] = useState<Wallet>();
    const [members, setMembers] = useState<WalletMember[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [totalAmount, setTotalAmount] = useState(0);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string>();
    const [loadingMore, setLoadingMore] = useState(false);
    const [deletingId, setDeletingId] = useState<string>();
    const [formOpen, setFormOpen] = useState(false);
    const [notice, setNotice] = useState<Notice>();

    useEffect(() => {
        let ignore = false; // ignore une réponse arrivée après un changement de page

        Promise.all([getWalletDetails(walletId), listExpenses(walletId)])
            .then(([details, page]) => {
                if (ignore) return;
                setWallet(details.wallet);
                setMembers(details.members);
                setExpenses(page.items);
                setNextCursor(page.nextCursor);
                setTotalAmount(page.totalAmount);
            })
            .catch((error: unknown) => {
                if (ignore) return;
                if (!(error instanceof ApiError) && !(error instanceof TypeError)) {
                    console.error(error);
                }
                setLoadError(describeExpenseError(error, 'load'));
            });

        return () => {
            ignore = true;
        };
    }, [walletId]);

    const isOpen = wallet?.status === 'OPEN';
    const acceptedMembers = members.filter((member) => member.status === 'MEMBER');

    function markWalletClosed() {
        setWallet((current) => (current ? { ...current, status: 'CLOSED' } : current));
        setFormOpen(false);
        setNotice({
            kind: 'error',
            message: 'Ce porte-monnaie vient d’être clôturé : l’opération a été refusée.',
        });
    }

    async function handleLoadMore() {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        setNotice(undefined);
        try {
            const page = await listExpenses(walletId, { cursor: nextCursor });
            setExpenses((current) => mergeExpenses(current, page.items));
            setNextCursor(page.nextCursor);
            setTotalAmount(page.totalAmount);
        } catch (error) {
            setNotice({ kind: 'error', message: describeExpenseError(error, 'load') });
        } finally {
            setLoadingMore(false);
        }
    }

    function handleCreated(expense: Expense) {
        setFormOpen(false);
        setExpenses((current) => mergeExpenses(current, [expense]));
        setTotalAmount((total) => total + expense.amount);
        setNotice({ kind: 'success', message: `La dépense « ${expense.title} » a été ajoutée.` });
    }

    function removeFromList(expense: Expense) {
        setExpenses((current) => current.filter((item) => item.id !== expense.id));
        setTotalAmount((total) => total - expense.amount);
    }

    async function handleDelete(expense: Expense) {
        if (deletingId) return;
        setDeletingId(expense.id);
        setNotice(undefined);
        try {
            await deleteExpense(walletId, expense.id);
            removeFromList(expense);
            setNotice({ kind: 'success', message: `La dépense « ${expense.title} » a été supprimée.` });
        } catch (error) {
            if (isClosedWalletError(error)) {
                markWalletClosed();
                return;
            }
            // 404 : la dépense n'existe déjà plus, on la retire aussi de l'écran.
            if (error instanceof ApiError && error.status === 404) {
                removeFromList(expense);
            }
            setNotice({ kind: 'error', message: describeExpenseError(error, 'delete') });
        } finally {
            setDeletingId(undefined);
        }
    }

    if (loadError) {
        return (
            <div className={styles.state} role="alert">
                <h1>Porte-monnaie indisponible</h1>
                <p>{loadError}</p>
                <Link href="/" className={styles.backLink}>Retour à l’accueil</Link>
            </div>
        );
    }

    if (!wallet) {
        return (
            <div className={styles.state} role="status" aria-live="polite">
                Chargement du porte-monnaie…
            </div>
        );
    }

    return (
        <div className={styles.content}>
            <Link href="/" className={styles.back}>
                <ChevronLeftIcon /> Accueil
            </Link>

            <section className={styles.summary}>
                <div className={styles.titleRow}>
                    <h1 className={styles.title}>{wallet.title}</h1>
                    <span className={isOpen ? styles.badgeOpen : styles.badgeClosed}>
            {isOpen ? 'Ouvert' : 'Clôturé'}
          </span>
                </div>
                {wallet.description ? (
                    <p className={styles.description}>{wallet.description}</p>
                ) : null}

                <div className={styles.actions}>
                    <ul className={styles.avatars} aria-label="Membres">
                        {acceptedMembers.map((member) => (
                            <li key={member.userId} className={styles.avatar} title={member.name}>
                                {initials(member.name)}
                            </li>
                        ))}
                    </ul>
                    {isOpen ? (
                        <Button onClick={() => { setNotice(undefined); setFormOpen(true); }}>
                            <PlusIcon className={styles.buttonIcon} /> Ajouter une dépense
                        </Button>
                    ) : null}
                </div>

                <div className={styles.total}>
                    <span>Total des dépenses :</span>
                    <strong>{formatCents(totalAmount)}</strong>
                </div>
            </section>

            {!isOpen ? (
                <p className={styles.closed} role="status">
                    <LockIcon className={styles.closedIcon} />
                    Ce porte-monnaie est clôturé. Vous pouvez consulter ses dépenses, mais il n’est
                    plus possible d’en ajouter, de les modifier ou de les supprimer.
                </p>
            ) : null}

            {notice ? (
                <p
                    className={notice.kind === 'success' ? styles.success : styles.alert}
                    role={notice.kind === 'success' ? 'status' : 'alert'}
                >
                    {notice.message}
                </p>
            ) : null}

            <ExpenseList
                expenses={expenses}
                currentUserId={currentUserId}
                canEdit={isOpen}
                deletingId={deletingId}
                onDelete={handleDelete}
                hasMore={nextCursor !== null}
                loadingMore={loadingMore}
                onLoadMore={handleLoadMore}
            />

            {formOpen && isOpen ? (
                <ExpenseForm
                    walletId={walletId}
                    payers={acceptedMembers}
                    currentUserId={currentUserId}
                    onCreated={handleCreated}
                    onClose={() => setFormOpen(false)}
                    onWalletClosed={markWalletClosed}
                />
            ) : null}
        </div>
    );
}