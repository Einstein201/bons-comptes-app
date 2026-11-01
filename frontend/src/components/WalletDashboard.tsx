'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import {
  listWallets,
  type WalletListItem,
  type WalletPage,
  type WalletSection,
} from '../services/wallets';
import { Button, ButtonLink } from './Button';
import {
  ArchiveIcon,
  ChevronRightIcon,
  MailIcon,
  PlusIcon,
  WalletIcon,
} from './icons';
import styles from './WalletDashboard.module.css';

const PAGE_SIZE = 10;

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

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '';
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

function WalletRow({ item, section }: { item: WalletListItem; section: WalletSection }) {
  const creator = item.isCreator ? 'Vous' : item.creatorName;

  if (section === 'invitations') {
    return (
      <li className={styles.invitation}>
        <span className={`${styles.badge} ${tone(item.id)}`}>
          <MailIcon />
        </span>
        <span className={styles.invitationText}>
          <span className={styles.name}>{item.title}</span>
          <span className={styles.meta}>Invité par {creator}</span>
        </span>
      </li>
    );
  }

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

export function WalletDashboard() {
  const [sections, setSections] = useState<Sections>({
    open: INITIAL_SECTION,
    closed: INITIAL_SECTION,
    invitations: INITIAL_SECTION,
  });
  const [totals, setTotals] = useState<Record<WalletSection, number>>();
  const [active, setActive] = useState<WalletSection>('open');
  const requests = useRef<Record<WalletSection, number>>({
    open: 0,
    closed: 0,
    invitations: 0,
  });

  const patch = useCallback((section: WalletSection, change: Partial<SectionState>) => {
    setSections((current) => ({
      ...current,
      [section]: { ...current[section], ...change },
    }));
  }, []);

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
    void load('open', 0, [undefined]);
    void load('closed', 0, [undefined]);
    void load('invitations', 0, [undefined]);
  }, [load]);

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
              <Button onClick={() => void load(active, state.index, state.cursors)}>
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
                {items.map((item) => (
                  <WalletRow key={item.id} item={item} section={active} />
                ))}
              </ul>
              {page.total > PAGE_SIZE || hasPrevious ? (
                <nav className={styles.pagination} aria-label="Pagination">
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={goPrevious}
                    disabled={!hasPrevious || state.loading}
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
                    disabled={!hasNext || state.loading}
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
