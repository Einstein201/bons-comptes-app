'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { WalletIcon } from './icons';
import { NotificationBell } from './NotificationBell';
import { AccountInfoModal } from './AccountInfoModal';
import styles from './AppHeader.module.css';

export function AppHeader() {
  const { status, signOut, user, updateName } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [menuOpen]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setMenuOpen(false);
      accountButtonRef.current?.focus();
    }
  }

  async function handleLogout() {
    let failed = false;
    try {
      await signOut();
    } catch (error) {
      failed = true;
      if (!(error instanceof ApiError) && !(error instanceof TypeError)) {
        console.error(error);
      }
    } finally {
      router.replace(failed ? '/login?logout=failed' : '/login');
    }
  }

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.logo}>
          <WalletIcon />
        </span>
        <span className={styles.brandName}>Les bons comptes</span>
      </Link>
      <div className={styles.actions}>
        {status === 'authenticated' && user ? (
          <>
            <NotificationBell />
            <div
              className={styles.accountMenu}
              ref={accountMenuRef}
              onKeyDown={handleMenuKeyDown}
            >
              <button
                type="button"
                ref={accountButtonRef}
                className={styles.accountButton}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className={styles.avatar} aria-hidden="true">{user.name.charAt(0).toUpperCase() || '?'}</span>
                <span>{user.name}</span>
              </button>
              {menuOpen ? (
                <div className={styles.menu} role="menu" aria-label="Menu du compte">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setAccountOpen(true);
                    }}
                  >
                    Profil
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuLogout}
                    onClick={() => void handleLogout()}
                  >
                    Déconnexion
                  </button>
                </div>
              ) : null}
            </div>
            {accountOpen ? (
              <AccountInfoModal
                name={user.name}
                email={user.email}
                onNameChange={updateName}
                onClose={() => setAccountOpen(false)}
              />
            ) : null}
          </>
        ) : (status === 'unauthenticated' || status === 'signed-out') &&
          pathname !== '/login' ? (
          <Link className={styles.login} href="/login">Connexion</Link>
        ) : null}
      </div>
    </header>
  );
}
