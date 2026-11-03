'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { WalletIcon } from './icons';
import { NotificationBell } from './NotificationBell';
import styles from './AppHeader.module.css';

export function AppHeader() {
  const { status, signOut } = useAuth();
  const router = useRouter();

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
        {status === 'authenticated' ? (
          <>
            <NotificationBell />
            <button type="button" className={styles.logout} onClick={handleLogout}>
              Déconnexion
            </button>
          </>
        ) : status === 'unauthenticated' || status === 'signed-out' ? (
          <Link className={styles.login} href="/login">Connexion</Link>
        ) : null}
      </div>
    </header>
  );
}
