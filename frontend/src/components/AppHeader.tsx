'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { WalletIcon } from './icons';
import { NotificationBell } from './NotificationBell';
import { AccountInfoModal } from './AccountInfoModal';
import styles from './AppHeader.module.css';

export function AppHeader() {
  const { status, signOut, user, updateName } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

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
            <div className={styles.accountMenu}>
              <button
                type="button"
                className={styles.accountButton}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className={styles.avatar} aria-hidden="true">{user.name.charAt(0).toUpperCase() || '?'}</span>
                <span>{user.name}</span>
              </button>
              {menuOpen ? (
                <div className={styles.menu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setAccountOpen(true);
                    }}
                  >
                    Informations du compte
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" className={styles.logout} onClick={handleLogout}>
              Déconnexion
            </button>
            {accountOpen ? (
              <AccountInfoModal
                name={user.name}
                email={user.email}
                onNameChange={updateName}
                onClose={() => setAccountOpen(false)}
              />
            ) : null}
          </>
        ) : status === 'unauthenticated' || status === 'signed-out' ? (
          <Link className={styles.login} href="/login">Connexion</Link>
        ) : null}
      </div>
    </header>
  );
}
