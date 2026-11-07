'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '../services/notifications';
import { formatRelativeTime } from '../utils/relativeTime';
import { BellIcon } from './icons';
import styles from './NotificationBell.module.css';

const PAGE_LIMIT = 10;
// Actualisation légère, sans websocket : un seul appel qui renvoie aussi le compteur de non lues.
const POLL_INTERVAL_MS = 30_000;
const SEEN_NOTIFICATIONS_KEY = 'bons-comptes:seen-notifications';
const TOAST_DURATION_MS = 7_000;

type LoadStatus = 'loading' | 'ready' | 'error';

// La notification mène à la page concernée : invitations reçues, ou le porte-monnaie.
function targetOf(notification: Notification): string | undefined {
  if (notification.type === 'INVITATION_RECEIVED') return '/invitations';
  if (notification.walletId) return `/wallets/${encodeURIComponent(notification.walletId)}`;
  return undefined;
}

export function NotificationBell() {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Incrémenté à chaque action locale : une réponse du serveur partie avant ne doit pas l'écraser.
  const generation = useRef(0);
  const seenIds = useRef(new Set<string>());
  const openRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [toast, setToast] = useState<Notification>();

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(SEEN_NOTIFICATIONS_KEY);
      const ids: unknown = stored ? JSON.parse(stored) : [];
      if (Array.isArray(ids)) {
        seenIds.current = new Set(ids.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      seenIds.current = new Set();
    }
  }, []);

  const refresh = useCallback(async () => {
    const startedAt = generation.current;
    try {
      const page = await getNotifications({ limit: PAGE_LIMIT });
      if (startedAt !== generation.current) return;
      setItems(page.items);
      setUnreadCount(page.unreadCount);
      setStatus('ready');

      const unseen = page.items.filter(
        (item) => item.readAt === null && !seenIds.current.has(item.id),
      );
      if (unseen.length > 0) {
        unseen.forEach((item) => seenIds.current.add(item.id));
        try {
          window.sessionStorage.setItem(
            SEEN_NOTIFICATIONS_KEY,
            JSON.stringify([...seenIds.current].slice(-100)),
          );
        } catch {
          // La notification reste affichée même si le navigateur bloque le stockage de session.
        }
        if (!openRef.current) setToast(unseen[0]);
      }
    } catch {
      // Un échec d'actualisation périodique garde les données déjà affichées.
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    // Le focus va sur la première notification, à défaut sur le menu lui-même.
    const first = panel?.querySelector<HTMLElement>('li button') ?? panel?.querySelector<HTMLElement>('button');
    (first ?? panel)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function toggle() {
    if (!open) {
      setToast(undefined);
      if (status !== 'ready') setStatus('loading');
      void refresh();
    }
    setOpen((current) => !current);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  // Le focus qui quitte le composant (Tab) referme le menu.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  function handleSelect(notification: Notification) {
    setOpen(false);
    setToast(undefined);

    if (!notification.readAt) {
      generation.current += 1;
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, readAt } : item)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      markNotificationRead(notification.id).catch(() => void refresh());
    }

    const target = targetOf(notification);
    if (target) router.push(target);
  }

  function handleMarkAllRead() {
    generation.current += 1;
    setToast(undefined);
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    markAllNotificationsRead().catch(() => void refresh());
  }

  function retry() {
    setStatus('loading');
    void refresh();
  }

  const now = new Date();
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);
  const label =
    unreadCount > 0
      ? `Notifications, ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`
      : 'Notifications';

  return (
    <div className={styles.root} ref={rootRef} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </button>

      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          <p className={styles.toastMessage}>{toast.message}</p>
          <div className={styles.toastActions}>
            <button type="button" className={styles.toastButton} onClick={toggle}>
              Voir les notifications
            </button>
            <button
              type="button"
              className={styles.toastButton}
              onClick={() => setToast(undefined)}
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div id={panelId} ref={panelRef} role="dialog" aria-label="Notifications" tabIndex={-1} className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Notifications</h2>
            {unreadCount > 0 ? (
              <button type="button" className={styles.markAll} onClick={handleMarkAllRead}>
                Tout marquer comme lu
              </button>
            ) : null}
          </div>

          {status === 'loading' ? (
            <p className={styles.message} role="status">
              Chargement des notifications…
            </p>
          ) : null}

          {status === 'error' ? (
            <div className={styles.message} role="alert">
              <p>Impossible de charger les notifications.</p>
              <button type="button" className={styles.retry} onClick={retry}>
                Réessayer
              </button>
            </div>
          ) : null}

          {status === 'ready' && items.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <BellIcon />
              </span>
              <p className={styles.emptyTitle}>Vous êtes à jour !</p>
              <p className={styles.emptyText}>Aucune notification pour le moment.</p>
            </div>
          ) : null}

          {status === 'ready' && items.length > 0 ? (
            <ul className={styles.list} aria-label="Liste des notifications">
              {items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={styles.item}
                    data-unread={notification.readAt === null}
                    onClick={() => handleSelect(notification)}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.itemText}>
                      <span className={styles.itemMessage}>
                        {notification.readAt === null ? (
                          <span className={styles.srOnly}>Non lue : </span>
                        ) : null}
                        {notification.message}
                      </span>
                      <span className={styles.itemTime}>
                        {formatRelativeTime(notification.createdAt, now)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
