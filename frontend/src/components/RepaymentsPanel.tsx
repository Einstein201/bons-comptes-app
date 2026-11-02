'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import {
  cancelRepayment,
  confirmRepayment,
  declareRepayment,
  getRepayments,
  type RepaymentListItem,
  type RepaymentPage,
  type RepaymentStatus,
} from '../services/repayments';
import type { OptimizedTransfer } from '../services/closure';
import { formatCents } from '../services/money';
import { Button } from './Button';
import styles from './RepaymentsPanel.module.css';

const PAGE_LIMIT = 10;

const statusLabels: Record<RepaymentStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payé',
  CANCELLED: 'Annulé',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.';
    if (error.status === 403) return 'Vous ne disposez pas des droits nécessaires pour cette action.';
    if (error.status === 404) return 'Ce remboursement ou ce porte-monnaie est introuvable.';
    if (error.status === 409) {
      return 'Le remboursement ou le solde a changé entre-temps. L’action n’a pas été confirmée; actualisation des données en cours.';
    }
  }
  if (error instanceof TypeError) return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
  return 'Une erreur est survenue. Réessayez.';
}

function parseAmountToCents(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const euros = BigInt(match[1]);
  const cents = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  const total = euros * BigInt(100) + cents;
  if (total <= BigInt(0) || total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(total);
}

function RepaymentRow({
  item,
  busy,
  onConfirm,
  onCancel,
}: {
  item: RepaymentListItem;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <li className={styles.item}>
      <div className={styles.itemHeader}>
        <strong>{item.fromUser.name} → {item.toUser.name}</strong>
        <span className={`${styles.status} ${styles[item.status.toLowerCase()]}`}>
          {statusLabels[item.status]}
        </span>
      </div>
      <p>Montant : <strong>{formatCents(item.amount)}</strong></p>
      <p>Déclaré le : {formatDate(item.createdAt)}</p>
      {item.paidAt && <p>Payé le : {formatDate(item.paidAt)}</p>}
      {(item.canConfirm || item.canCancel) && (
        <div className={styles.actions}>
          {item.canConfirm && (
            <Button disabled={busy} onClick={onConfirm}>
              Confirmer le remboursement
            </Button>
          )}
          {item.canCancel && (
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              Annuler le remboursement
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function RepaymentsPanel({
  walletId,
  userId,
  transfers,
  memberNames,
  onFinancialRefresh,
}: {
  walletId: string;
  userId: string;
  transfers: OptimizedTransfer[];
  memberNames: Record<string, string>;
  onFinancialRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState<RepaymentStatus | ''>('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<RepaymentPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();
  const actionPending = useRef(false);
  const outgoingTransfers = transfers.filter(
    (transfer) => transfer.fromUserId === userId && transfer.declarableAmount > 0,
  );
  const selectedTransfer = outgoingTransfers.find(
    (transfer) => transfer.toUserId === recipientId,
  ) ?? outgoingTransfers[0];

  useEffect(() => {
    let active = true;
    setLoading(true);
    getRepayments(walletId, {
      limit: PAGE_LIMIT,
      cursor: cursors[cursors.length - 1],
      ...(status ? { status } : {}),
    }).then((result) => {
      if (active) {
        setPage(result);
      }
    }).catch((loadError: unknown) => {
      if (active) setError(describeError(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [walletId, status, cursors, revision]);

  async function refreshAfterMutation(actionSucceeded = true) {
    setRevision((value) => value + 1);
    try {
      await onFinancialRefresh();
    } catch {
      setError(actionSucceeded
        ? 'L’action a été enregistrée, mais le bilan n’a pas pu être actualisé. Réessayez.'
        : 'Le conflit a été détecté, mais les dernières données n’ont pas pu être rechargées. L’action n’a pas été confirmée; réessayez.');
    }
  }

  async function runAction(
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    if (actionPending.current) return false;
    actionPending.current = true;
    setPendingAction(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
    } catch (actionError) {
      setError(describeError(actionError));
      if (actionError instanceof ApiError && actionError.status === 409) {
        void refreshAfterMutation(false);
      }
      actionPending.current = false;
      setPendingAction(undefined);
      return false;
    }

    setNotice(successMessage);
    actionPending.current = false;
    setPendingAction(undefined);
    await refreshAfterMutation();
    return true;
  }

  async function submitDeclaration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionPending.current) return;
    if (!selectedTransfer) {
      setFormError('Aucun remboursement n’est actuellement déclarable.');
      return;
    }
    const amountCents = parseAmountToCents(amount);
    if (amountCents === null) {
      setFormError('Saisissez un montant positif avec au plus deux décimales.');
      return;
    }
    if (amountCents > selectedTransfer.declarableAmount) {
      setFormError(`Le montant ne peut pas dépasser ${formatCents(selectedTransfer.declarableAmount)}.`);
      return;
    }
    setFormError(undefined);
    const succeeded = await runAction(
      'declare',
      () => declareRepayment(walletId, {
        toUserId: selectedTransfer.toUserId,
        amount: amountCents,
      }),
      'Le remboursement a été déclaré.',
    );
    if (succeeded) setAmount('');
  }

  function changeStatus(value: string) {
    setStatus(value as RepaymentStatus | '');
    setCursors([undefined]);
    setPage(undefined);
    setError(undefined);
  }

  function goToNextPage() {
    if (!page?.nextCursor) return;
    setCursors((current) => [...current, page.nextCursor ?? undefined]);
    setPage(undefined);
  }

  function goToPreviousPage() {
    if (cursors.length <= 1) return;
    setCursors((current) => current.slice(0, -1));
    setPage(undefined);
  }

  return (
    <section className={styles.card} aria-busy={loading || Boolean(pendingAction)}>
      <h2>Remboursements</h2>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      {outgoingTransfers.length > 0 && (
        <form className={styles.form} onSubmit={(event) => void submitDeclaration(event)}>
          <h3>Déclarer un remboursement</h3>
          <label>
            Rembourser à
            <select
              value={selectedTransfer?.toUserId ?? ''}
              onChange={(event) => {
                setRecipientId(event.target.value);
                setAmount('');
                setFormError(undefined);
              }}
              disabled={Boolean(pendingAction)}
            >
              {outgoingTransfers.map((transfer) => (
                <option key={transfer.toUserId} value={transfer.toUserId}>
                  {memberNames[transfer.toUserId] ?? transfer.toUserId}
                </option>
              ))}
            </select>
          </label>
          {selectedTransfer && (
            <p>Montant encore déclarable : <strong>{formatCents(selectedTransfer.declarableAmount)}</strong></p>
          )}
          <label>
            Montant (€)
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'repayment-form-error' : undefined}
              disabled={Boolean(pendingAction)}
              placeholder="0,00"
            />
          </label>
          {formError && <p id="repayment-form-error" className={styles.error} role="alert">{formError}</p>}
          <Button type="submit" disabled={Boolean(pendingAction)}>
            {pendingAction === 'declare' ? 'Déclaration en cours…' : 'Déclarer le remboursement'}
          </Button>
        </form>
      )}

      <div className={styles.filter}>
        <label htmlFor="repayment-status">Filtrer par statut</label>
        <select
          id="repayment-status"
          value={status}
          onChange={(event) => changeStatus(event.target.value)}
        >
          <option value="">Tous</option>
          <option value="PENDING">En attente</option>
          <option value="PAID">Payés</option>
          <option value="CANCELLED">Annulés</option>
        </select>
      </div>

      {loading && <p role="status">Chargement des remboursements…</p>}
      {!loading && error && !page && (
        <Button
          variant="secondary"
          onClick={() => {
            setError(undefined);
            setRevision((value) => value + 1);
          }}
        >
          Réessayer
        </Button>
      )}
      {!loading && page && (
        <>
          {page.items.length === 0 ? (
            <p>Aucun remboursement pour ce filtre.</p>
          ) : (
            <ul className={styles.list}>
              {page.items.map((item) => (
                <RepaymentRow
                  key={item.id}
                  item={item}
                  busy={Boolean(pendingAction)}
                  onConfirm={() => void runAction(
                    item.id,
                    () => confirmRepayment(walletId, item.id),
                    'Le remboursement a été confirmé.',
                  )}
                  onCancel={() => void runAction(
                    item.id,
                    () => cancelRepayment(walletId, item.id),
                    'Le remboursement a été annulé.',
                  )}
                />
              ))}
            </ul>
          )}
          <nav className={styles.pagination} aria-label="Pagination des remboursements">
            <Button
              variant="secondary"
              disabled={cursors.length <= 1 || loading}
              onClick={goToPreviousPage}
            >
              Précédent
            </Button>
            <span>Page {cursors.length}</span>
            <Button
              variant="secondary"
              disabled={!page.nextCursor || loading}
              onClick={goToNextPage}
            >
              Suivant
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
