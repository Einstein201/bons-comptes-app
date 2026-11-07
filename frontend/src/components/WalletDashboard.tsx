'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import {
  acceptInvitation,
  declineInvitation,
} from '../services/invitations';
import {
  listWallets,
  type InvitationItem,
  type WalletListItem,
  type WalletPage,
  type WalletLists,
  type WalletSection,
} from '../services/wallets';
import { Button, ButtonLink } from './Button';
import { describeInvitationError } from './invitationErrors';
import {
  ArchiveIcon,
  ChevronRightIcon,
  MailIcon,
  PlusIcon,
  WalletIcon,
} from './icons';
import styles from './WalletDashboard.module.css';

const PAGE_SIZE = 10;

// Ces refus signifient que la ligne affichée est périmée : retirée, déjà traitée ou clôturée.
const STALE_INVITATION_STATUSES = new Set([403, 404, 409]);

const TABS: { section: WalletSection; label: string }[] = [
  { section: 'invitations', label: 'Invitations en attente' },
  { section: 'open', label: 'Ouverts' },
  { section: 'closed', label: 'Clos' },
];

const EMPTY_STATES: Record<
  WalletSection,
  { title: string; text: string; withAction?: boolean }
> = {
  open: {
    title: 'Aucun porte-monnaie pour le moment',
    text: 'Créez votre premier porte-monnaie et commencez à partager vos dépenses simplement.',
    withAction: true,
  },
  closed: {
    title: 'Aucun porte-monnaie clos',
    text: "L'historique de vos porte-monnaies clôturés s'affichera ici.",
  },
  invitations: {
    title: 'Aucune invitation en attente',
    text: 'Les invitations à rejoindre un groupe apparaîtront ici.',
  },
};

type SectionState = {
  page?: WalletPage;
  // cursors[i] est le curseur qui a servi à charger la page i (undefined pour la première).
  cursors: (string | undefined)[];
  index: number;
  loading: boolean;
  error?: string;
};

type Sections = Record<WalletSection, SectionState>;

const INITIAL_SECTION: SectionState = { cursors: [undefined], index: 0, loading: true };

type InvitationAction = 'accept' | 'decline';

type PendingAction = { invitationId: string; action: InvitationAction };

type ActionNotice = {
  kind: 'success' | 'error';
  message: string;
  link?: { href: string; label: string };
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '';
}

function isUnexpectedError(error: unknown): boolean {
  return !(error instanceof ApiError) && !(error instanceof TypeError);
}

// Une panne (réseau, 5xx) ne dit rien de l'invitation : la liste reste affichée pour réessayer.
// Une réponse illisible, elle, peut cacher une action réussie : on vérifie auprès du serveur.
function isListStale(error: unknown): boolean {
  if (error instanceof ApiError) return STALE_INVITATION_STATUSES.has(error.status);
  return !(error instanceof TypeError);
}

function describeError(error: unknown): string {
  if (error instanceof TypeError) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.';
  }
  if (error instanceof ApiError && error.status < 500) {
    return 'Impossible de charger vos porte-monnaies. Actualisez la page.';
  }
  return 'Le serveur a rencontré une erreur. Réessayez dans un instant.';
}

// L'API ne renvoie pas de catégorie : la couleur de la pastille varie selon l'identifiant.
function tone(id: string): string {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return styles[`tone${sum % 4}`];
}

function EmptyIllustration({ section }: { section: WalletSection }) {
  const Icon =
    section === 'invitations' ? MailIcon : section === 'closed' ? ArchiveIcon : WalletIcon;
  return (
    <span className={styles.illustration} aria-hidden="true">
      <Icon />
    </span>
  );
}

function InvitationRow({
  invitation,
  pendingAction,
  disabled,
  onAction,
}: {
  invitation: InvitationItem;
  pendingAction?: InvitationAction;
  disabled: boolean;
  onAction: (invitation: InvitationItem, action: InvitationAction) => void;
}) {
  return (
    <li className={styles.invitation}>
      <span className={`${styles.badge} ${tone(invitation.id)}`}>
        <MailIcon />
      </span>
      <span className={styles.invitationText}>
        <span className={styles.name}>{invitation.title}</span>
        <span className={styles.meta}>
          Invité par {invitation.isCreator ? 'Vous' : invitation.creatorName}
        </span>
      </span>
      <span className={styles.invitationActions}>
        <Button
          onClick={() => onAction(invitation, 'accept')}
          disabled={disabled}
          aria-label={`Accepter l’invitation à ${invitation.title}`}
        >
          {pendingAction === 'accept' ? 'Acceptation…' : 'Accepter'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onAction(invitation, 'decline')}
          disabled={disabled}
          aria-label={`Refuser l’invitation à ${invitation.title}`}
        >
          {pendingAction === 'decline' ? 'Refus…' : 'Refuser'}
        </Button>
      </span>
    </li>
  );
}

function WalletRow({ item, section }: { item: WalletListItem; section: WalletSection }) {
  const creator = item.isCreator ? 'Vous' : item.creatorName;

  const date =
    section === 'closed'
      ? `Clos le ${formatDate(item.closedAt)}`
      : `Mis à jour le ${formatDate(item.updatedAt)}`;

  return (
    <li>
      <Link href={`/wallets/${item.id}`} className={styles.row}>
        <span className={styles.nameCell}>
          <span className={`${styles.badge} ${tone(item.id)}`}>
            <WalletIcon />
          </span>
          <span className={styles.name}>{item.title}</span>
        </span>
        <span className={styles.creator}>{creator}</span>
        <span className={styles.date}>{date}</span>
        <ChevronRightIcon className={styles.chevron} />
      </Link>
    </li>
  );
}

export function WalletDashboard({
  initialSection = 'open',
}: {
  initialSection?: WalletSection;
}) {
  const [sections, setSections] = useState<Sections>({
    open: INITIAL_SECTION,
    closed: INITIAL_SECTION,
    invitations: INITIAL_SECTION,
  });
  const [totals, setTotals] = useState<Record<WalletSection, number>>();
  const [active, setActive] = useState<WalletSection>(initialSection);
  const [pending, setPending] = useState<PendingAction>();
  const [notice, setNotice] = useState<ActionNotice>();
  // Le verrou est lu avant le prochain rendu : deux clics rapprochés ne lancent qu'une action.
  const actionLock = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const requests = useRef<Record<WalletSection, number>>({
    open: 0,
    closed: 0,
    invitations: 0,
  });
  const initialRequest = useRef(0);

  const patch = useCallback((section: WalletSection, change: Partial<SectionState>) => {
    setSections((current) => ({
      ...current,
      [section]: { ...current[section], ...change },
    }));
  }, []);

  const applyLists = useCallback(
    (
      lists: WalletLists,
      invitationsPosition: Pick<SectionState, 'cursors' | 'index'> = {
        cursors: [undefined],
        index: 0,
      },
    ) => {
      setTotals({
        open: lists.open.total,
        closed: lists.closed.total,
        invitations: lists.invitations.total,
      });
      setSections({
        open: { page: lists.open, cursors: [undefined], index: 0, loading: false },
        closed: { page: lists.closed, cursors: [undefined], index: 0, loading: false },
        invitations: { page: lists.invitations, ...invitationsPosition, loading: false },
      });
    },
    [],
  );

  // La route renvoie les trois sections à chaque appel : seule celle demandée est mise à jour,
  // les compteurs des onglets sont rafraîchis avec les totaux reçus.
  const load = useCallback(
    async (section: WalletSection, index: number, cursors: (string | undefined)[]) => {
      const request = ++requests.current[section];
      patch(section, { loading: true, error: undefined });

      try {
        const lists = await listWallets({
          section,
          cursor: cursors[index],
          limit: PAGE_SIZE,
        });
        if (requests.current[section] !== request) return;

        setTotals({
          open: lists.open.total,
          closed: lists.closed.total,
          invitations: lists.invitations.total,
        });
        patch(section, { page: lists[section], cursors, index, loading: false });
      } catch (error) {
        if (requests.current[section] !== request) return;
        if (!(error instanceof ApiError) && !(error instanceof TypeError)) {
          console.error(error);
        }
        patch(section, { loading: false, error: describeError(error) });
      }
    },
    [patch],
  );

  useEffect(() => {
    const request = ++initialRequest.current;
    setSections({
      open: INITIAL_SECTION,
      closed: INITIAL_SECTION,
      invitations: INITIAL_SECTION,
    });

    void listWallets({ limit: PAGE_SIZE })
      .then((lists) => {
        if (initialRequest.current !== request) return;

        applyLists(lists);
      })
      .catch((error: unknown) => {
        if (initialRequest.current !== request) return;
        if (!(error instanceof ApiError) && !(error instanceof TypeError)) {
          console.error(error);
        }

        const message = describeError(error);
        setSections({
          open: { cursors: [undefined], index: 0, loading: false, error: message },
          closed: { cursors: [undefined], index: 0, loading: false, error: message },
          invitations: { cursors: [undefined], index: 0, loading: false, error: message },
        });
      });

    return () => {
      initialRequest.current += 1;
    };
  }, [applyLists]);

  // La ligne traitée disparaît : sans cela, le focus clavier serait perdu en haut de la page.
  useEffect(() => {
    if (notice && document.activeElement === document.body) noticeRef.current?.focus();
  }, [notice]);

  const state = sections[active];
  const page = state.page;
  const items = page?.items ?? [];
  const pageCount = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1;
  const hasPrevious = state.index > 0;
  const hasNext = Boolean(page?.nextCursor);

  function goNext() {
    if (!page?.nextCursor) return;
    const cursors = [...state.cursors.slice(0, state.index + 1), page.nextCursor];
    void load(active, state.index + 1, cursors);
  }

  function goPrevious() {
    if (hasPrevious) void load(active, state.index - 1, state.cursors);
  }

  function removeInvitationLocally(invitationId: string, action: InvitationAction) {
    setSections((current) => {
      const invitations = current.invitations;
      if (!invitations.page) return current;
      const items = (invitations.page.items as InvitationItem[]).filter(
        (item) => item.invitationId !== invitationId,
      );
      return {
        ...current,
        invitations: {
          ...invitations,
          page: {
            ...invitations.page,
            items,
            total: Math.max(0, invitations.page.total - 1),
          },
        },
      };
    });
    setTotals(
      (current) =>
        current && {
          ...current,
          invitations: Math.max(0, current.invitations - 1),
          open: action === 'accept' ? current.open + 1 : current.open,
        },
    );
  }

  // Recharge la page d'invitations affichée (ou la première si elle est désormais vide), ainsi que
  // les premières pages des autres onglets. `staleSection` n'a plus de données fiables si cela échoue.
  async function refreshAfterAction(staleSection?: WalletSection) {
    // Une page demandée avant l'action ne doit pas écraser la liste à jour.
    requests.current.open += 1;
    requests.current.closed += 1;
    requests.current.invitations += 1;
    const { cursors, index } = sections.invitations;

    try {
      const lists = await listWallets({
        section: 'invitations',
        cursor: cursors[index],
        limit: PAGE_SIZE,
      });
      if (lists.invitations.items.length === 0 && index > 0) {
        applyLists(await listWallets({ limit: PAGE_SIZE }));
      } else {
        applyLists(lists, { cursors, index });
      }
    } catch (error) {
      if (isUnexpectedError(error)) console.error(error);
      const message = describeError(error);
      const settle = (section: WalletSection, current: SectionState): SectionState => ({
        ...current,
        loading: false,
        error: section === staleSection ? message : current.error,
      });
      setSections((current) => ({
        open: settle('open', current.open),
        closed: settle('closed', current.closed),
        invitations: settle('invitations', current.invitations),
      }));
    }
  }

  async function handleInvitationAction(invitation: InvitationItem, action: InvitationAction) {
    if (actionLock.current) return;
    actionLock.current = true;
    const { invitationId, title } = invitation;
    setPending({ invitationId, action });
    setNotice(undefined);

    try {
      if (action === 'accept') {
        await acceptInvitation(invitationId);
        setNotice({
          kind: 'success',
          message: `Vous avez rejoint le porte-monnaie « ${title} ».`,
          link: {
            href: `/wallets/${encodeURIComponent(invitation.id)}`,
            label: `Ouvrir « ${title} »`,
          },
        });
      } else {
        await declineInvitation(invitationId);
        setNotice({ kind: 'success', message: `Invitation à « ${title} » refusée.` });
      }
      // Retrait immédiat : l'écran reste juste même si le rechargement qui suit échoue.
      removeInvitationLocally(invitationId, action);
      await refreshAfterAction(action === 'accept' ? 'open' : undefined);
    } catch (error) {
      if (isUnexpectedError(error)) console.error(error);
      setNotice({ kind: 'error', message: describeInvitationError(error, action) });
      if (isListStale(error)) await refreshAfterAction('invitations');
    } finally {
      actionLock.current = false;
      setPending(undefined);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>Mes porte-monnaie</h1>
          <p className={styles.subtitle}>Gérez vos dépenses partagées en toute simplicité.</p>
        </div>
        <ButtonLink href="/wallets/new" variant="primary" size="lg">
          <PlusIcon className={styles.plus} />
          Nouveau porte-monnaie
        </ButtonLink>
      </div>

      <section className={styles.card} aria-label="Mes porte-monnaie">
        <div className={styles.tabs} role="tablist">
          {TABS.map(({ section, label }) => (
            <button
              key={section}
              type="button"
              role="tab"
              id={`tab-${section}`}
              aria-selected={active === section}
              aria-controls="wallet-panel"
              className={styles.tab}
              onClick={() => setActive(section)}
            >
              {label}
              <span className={styles.count}>{totals?.[section] ?? '–'}</span>
            </button>
          ))}
        </div>

        {notice ? (
          <div
            ref={noticeRef}
            tabIndex={-1}
            className={`${styles.notice} ${notice.kind === 'success' ? styles.success : styles.error}`}
            role={notice.kind === 'success' ? 'status' : 'alert'}
          >
            <span>{notice.message}</span>
            {notice.link ? (
              <ButtonLink href={notice.link.href}>{notice.link.label}</ButtonLink>
            ) : null}
          </div>
        ) : null}

        <div
          id="wallet-panel"
          role="tabpanel"
          aria-labelledby={`tab-${active}`}
          aria-busy={state.loading}
        >
          {state.error ? (
            <div className={styles.empty} role="alert">
              <h2 className={styles.emptyTitle}>Chargement impossible</h2>
              <p className={styles.emptyText}>{state.error}</p>
              <Button
                onClick={() => void load(active, state.index, state.cursors)}
                disabled={pending !== undefined}
              >
                Réessayer
              </Button>
            </div>
          ) : !page ? (
            <p className={styles.loading} role="status">
              Chargement…
            </p>
          ) : items.length === 0 ? (
            <div className={styles.empty}>
              <EmptyIllustration section={active} />
              <h2 className={styles.emptyTitle}>{EMPTY_STATES[active].title}</h2>
              <p className={styles.emptyText}>{EMPTY_STATES[active].text}</p>
              {EMPTY_STATES[active].withAction ? (
                <ButtonLink href="/wallets/new" variant="primary" size="lg">
                  <PlusIcon className={styles.plus} />
                  Créer un porte-monnaie
                </ButtonLink>
              ) : null}
            </div>
          ) : (
            <>
              {active !== 'invitations' ? (
                <div className={styles.columns} aria-hidden="true">
                  <span>Nom</span>
                  <span>Créateur</span>
                  <span>Date</span>
                </div>
              ) : null}
              <ul className={styles.list} data-loading={state.loading}>
                {active === 'invitations'
                  ? (items as InvitationItem[]).map((invitation) => (
                      <InvitationRow
                        key={invitation.invitationId}
                        invitation={invitation}
                        pendingAction={
                          pending?.invitationId === invitation.invitationId
                            ? pending.action
                            : undefined
                        }
                        disabled={pending !== undefined || state.loading}
                        onAction={(target, action) => void handleInvitationAction(target, action)}
                      />
                    ))
                  : items.map((item) => <WalletRow key={item.id} item={item} section={active} />)}
              </ul>
              {page.total > PAGE_SIZE || hasPrevious ? (
                <nav className={styles.pagination} aria-label="Pagination">
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={goPrevious}
                    disabled={!hasPrevious || state.loading || pending !== undefined}
                  >
                    Précédent
                  </button>
                  <span className={styles.pageInfo} aria-live="polite">
                    Page {state.index + 1} sur {pageCount}
                  </span>
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={goNext}
                    disabled={!hasNext || state.loading || pending !== undefined}
                  >
                    Suivant
                  </button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
