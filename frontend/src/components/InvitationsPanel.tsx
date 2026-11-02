'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acceptInvitation,
  getInvitations,
  type Invitation,
} from '../services/invitations';
import { Button, ButtonLink } from './Button';
import { describeInvitationError } from './invitationErrors';
import styles from './InvitationsPanel.module.css';

const PAGE_LIMIT = 10;

type Notice = { kind: 'success' | 'error'; message: string };

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

export function InvitationsPanel() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string>();
  const [acceptedIds, setAcceptedIds] = useState<Record<string, string>>({});
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const page = await getInvitations({ limit: PAGE_LIMIT });
      setInvitations(page.data);
      setNextCursor(page.nextCursor);
      setLoadError(undefined);
    } catch (error) {
      setLoadError(describeInvitationError(error, 'load'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getInvitations({ limit: PAGE_LIMIT, cursor: nextCursor });
      setInvitations((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.data.filter((item) => !known.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      setNotice({ kind: 'error', message: describeInvitationError(error, 'load') });
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleAccept(invitation: Invitation) {
    if (busy.current) return;
    busy.current = true;
    setAcceptingId(invitation.id);
    setNotice(undefined);
    try {
      await acceptInvitation(invitation.id);
    } catch (error) {
      setNotice({ kind: 'error', message: describeInvitationError(error, 'accept') });
      // Un conflit ou une invitation retirée : la liste affichée est périmée.
      await load();
      busy.current = false;
      setAcceptingId(undefined);
      return;
    }

    setAcceptedIds((current) => ({ ...current, [invitation.id]: invitation.wallet.id }));
    setNotice({
      kind: 'success',
      message: `Vous avez rejoint le porte-monnaie « ${invitation.wallet.title} ».`,
    });
    await load();
    busy.current = false;
    setAcceptingId(undefined);
  }

  const joined = Object.entries(acceptedIds);

  return (
    <section className={styles.card} aria-labelledby="invitations-title">
      <h2 id="invitations-title">Invitations reçues</h2>

      {notice ? (
        <p
          className={notice.kind === 'success' ? styles.success : styles.error}
          role={notice.kind === 'success' ? 'status' : 'alert'}
        >
          {notice.message}
        </p>
      ) : null}

      {joined.length > 0 ? (
        <ul className={styles.list} aria-label="Porte-monnaies rejoints">
          {joined.map(([invitationId, walletId]) => (
            <li key={invitationId}>
              <ButtonLink href={`/wallets/${encodeURIComponent(walletId)}`} variant="primary">
                Ouvrir le porte-monnaie
              </ButtonLink>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? <p role="status">Chargement des invitations…</p> : null}
      {loadError ? <p className={styles.error} role="alert">{loadError}</p> : null}

      {!loading && !loadError && invitations.length === 0 ? (
        <p className={styles.empty}>Vous n’avez aucune invitation en attente.</p>
      ) : null}

      {invitations.length > 0 ? (
        <ul className={styles.list} aria-label="Liste des invitations">
          {invitations.map((invitation) => (
            <li key={invitation.id} className={styles.item}>
              <div>
                <strong>{invitation.wallet.title}</strong>
                {invitation.wallet.description ? <p>{invitation.wallet.description}</p> : null}
                <small>Invité le {dateFormat.format(new Date(invitation.invitedAt))}</small>
              </div>
              <Button
                onClick={() => void handleAccept(invitation)}
                disabled={acceptingId !== undefined}
                aria-label={`Accepter l’invitation à ${invitation.wallet.title}`}
              >
                {acceptingId === invitation.id ? 'Acceptation…' : 'Accepter'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {nextCursor ? (
        <Button variant="secondary" onClick={() => void handleLoadMore()} disabled={loadingMore}>
          {loadingMore ? 'Chargement…' : 'Voir plus'}
        </Button>
      ) : null}
    </section>
  );
}
