'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import {
  closeWallet, getOptimizedPayments, getWalletBalance,
  type OptimizedPayments, type WalletBalance as Balance,
} from '../services/closure';
import { formatCents } from '../services/money';
import { getWallet, type WalletDetails } from '../services/wallets';
import { Button } from './Button';
import styles from './WalletBalance.module.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; detail: WalletDetails; financial?: { balance: Balance; plan: OptimizedPayments } };

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.';
    if (error.status === 403) return 'Vous ne disposez pas des droits nécessaires pour cette action.';
    if (error.status === 404) return 'Porte-monnaie introuvable.';
    if (error.status === 409) return 'Le statut du porte-monnaie a changé. Actualisez les données.';
    return 'Le serveur a rencontré une erreur. Réessayez.';
  }
  if (error instanceof TypeError) return 'Impossible de joindre le serveur. Vérifiez votre connexion.';
  return 'Les données du porte-monnaie ne peuvent pas être affichées. Réessayez.';
}

function checkFinancialData(balance: Balance, plan: OptimizedPayments): void {
  const members = new Set(balance.balances.map((member) => member.userId));
  const sum = (field: 'balance' | 'paidAmount' | 'shareAmount') =>
    balance.balances.reduce((total, member) => total + BigInt(member[field]), BigInt(0));
  const pairs = new Map<string, number>();
  const unsettled = new Map(balance.balances.map((member) => [member.userId, BigInt(member.balance)]));
  const pairKey = (from: string, to: string) => JSON.stringify([from, to]);
  let valid = members.size > 0 && members.size === balance.balances.length &&
    sum('balance') === BigInt(0) && sum('paidAmount') === BigInt(balance.totalAmount) &&
    sum('shareAmount') === BigInt(balance.totalAmount);

  for (const transfer of balance.transfers) {
    const key = pairKey(transfer.fromUserId, transfer.toUserId);
    if (pairs.has(key) || !members.has(transfer.fromUserId) || !members.has(transfer.toUserId)) {
      valid = false;
    }
    pairs.set(key, transfer.amount);
    if (members.has(transfer.fromUserId) && members.has(transfer.toUserId)) {
      unsettled.set(transfer.fromUserId, unsettled.get(transfer.fromUserId)! + BigInt(transfer.amount));
      unsettled.set(transfer.toUserId, unsettled.get(transfer.toUserId)! - BigInt(transfer.amount));
    }
  }
  for (const transfer of plan.transfers) {
    const key = pairKey(transfer.fromUserId, transfer.toUserId);
    if (pairs.get(key) !== transfer.remainingAmount) valid = false;
    pairs.delete(key);
  }
  if (!valid || pairs.size !== 0 || [...unsettled.values()].some((amount) => amount !== BigInt(0))) {
    throw new Error('Le bilan et les virements sont incohérents.');
  }
}

export function WalletBalance({ walletId }: { walletId: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const actionPending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const detail = await getWallet(walletId);
        let financial: { balance: Balance; plan: OptimizedPayments } | undefined;
        if (detail.wallet.status === 'CLOSED') {
          const [balance, plan] = await Promise.all([
            getWalletBalance(walletId), getOptimizedPayments(walletId),
          ]);
          checkFinancialData(balance, plan);
          financial = { balance, plan };
        }
        if (active) setState({ status: 'ready', detail, financial });
      } catch (error) {
        if (active) setState({ status: 'error', message: describeError(error) });
      }
    }
    void load();
    return () => { active = false; };
  }, [walletId, revision]);

  function refresh() {
    setState({ status: 'loading' });
    setConfirming(false);
    setActionError(undefined);
    setRevision((value) => value + 1);
  }

  async function confirmClose() {
    if (actionPending.current || state.status !== 'ready' ||
      state.detail.wallet.status !== 'OPEN' || !state.detail.wallet.isCreator) return;
    actionPending.current = true;
    setClosing(true);
    setActionError(undefined);
    try {
      await closeWallet(walletId);
      if (mounted.current) {
        setNotice('Le porte-monnaie a été clôturé.');
        refresh();
      }
    } catch (error) {
      if (mounted.current) setActionError(describeError(error));
    } finally {
      actionPending.current = false;
      if (mounted.current) setClosing(false);
    }
  }

  if (state.status === 'loading') return <p role="status">Chargement du porte-monnaie…</p>;
  if (state.status === 'error') return (
    <section>
      {notice && <p role="status">{notice}</p>}
      <p className={styles.error} role="alert">{state.message} Aucun bilan valide n’est disponible.</p>
      <Button onClick={refresh}>Réessayer</Button>
    </section>
  );

  const { wallet } = state.detail;
  const financial = state.financial;
  const nameOf = (userId: string) =>
    financial?.balance.balances.find((member) => member.userId === userId)?.name;

  return (
    <section className={styles.content} aria-busy={closing}>
      <header className={styles.header}>
        <div>
          <p className={styles.status}>{wallet.status === 'OPEN' ? 'Ouvert' : 'Clôturé'}</p>
          <h1>{wallet.title}</h1>
          {wallet.description && <p>{wallet.description}</p>}
        </div>
        <Button variant="secondary" disabled={closing} onClick={refresh}>Actualiser</Button>
      </header>
      {notice && <p role="status">{notice}</p>}
      {actionError && <p className={styles.error} role="alert">{actionError}</p>}
      {wallet.status === 'OPEN' && (
        <section className={styles.card}>
          <h2>Clôture du porte-monnaie</h2>
          <p>Le bilan sera disponible uniquement après la clôture.</p>
          {wallet.isCreator ? (
            confirming ? (
              <div>
                <p>Confirmer la clôture ? Les dépenses ne pourront plus être modifiées.</p>
                <div className={styles.actions}>
                  <Button disabled={closing} onClick={() => void confirmClose()}>
                    {closing ? 'Clôture en cours…' : 'Confirmer la clôture'}
                  </Button>
                  <Button variant="secondary" disabled={closing} onClick={() => setConfirming(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : <Button onClick={() => setConfirming(true)}>Clôturer le porte-monnaie</Button>
          ) : <p>Seul le créateur peut clôturer ce porte-monnaie.</p>}
        </section>
      )}
      {wallet.status === 'CLOSED' && financial && (
        <>
          <section className={styles.card}>
            <h2>Bilan financier</h2>
            <p>Total des dépenses : <strong>{formatCents(financial.balance.totalAmount)}</strong></p>
            <p>Un solde positif est à recevoir; un solde négatif est à rembourser. Les remboursements validés sont pris en compte.</p>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption>Soldes des membres</caption>
                <thead><tr><th scope="col">Membre</th><th scope="col">Dépenses payées</th><th scope="col">Part</th><th scope="col">Solde</th></tr></thead>
                <tbody>{financial.balance.balances.map((member) => (
                  <tr key={member.userId}>
                    <th scope="row">{member.name}</th>
                    <td>{formatCents(member.paidAmount)}</td>
                    <td>{formatCents(member.shareAmount)}</td>
                    <td>{formatCents(member.balance)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          <section className={styles.card}>
            <h2>Virements proposés</h2>
            <p>Le reste à régler exclut les remboursements validés. Le montant encore déclarable exclut aussi ceux en attente de validation.</p>
            {financial.plan.transfers.length === 0 ? <p>Tous les comptes sont réglés.</p> : (
              <ul className={styles.transfers}>{financial.plan.transfers.map((transfer) => (
                <li key={JSON.stringify([transfer.fromUserId, transfer.toUserId])}>
                  <h3>{nameOf(transfer.fromUserId)} → {nameOf(transfer.toUserId)}</h3>
                  <p>Reste à régler : <strong>{formatCents(transfer.remainingAmount)}</strong></p>
                  <p>Encore déclarable : <strong>{formatCents(transfer.declarableAmount)}</strong></p>
                  {transfer.declarableAmount === 0 && <p>Le reste dû est entièrement en attente de validation.</p>}
                </li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
