'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';
import styles from './ProtectedRoute.module.css';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, retrySession } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login');
    } else if (status === 'unauthenticated') {
      const next = encodeURIComponent(pathname || '/');
      router.replace(`/login?next=${next}`);
    }
  }, [pathname, router, status]);

  if (status === 'unavailable') {
    return (
      <main className={styles.state} role="alert">
        <h1>Connexion au serveur impossible</h1>
        <p>Votre session n’a pas pu être vérifiée. Vérifiez votre connexion et réessayez.</p>
        <Button onClick={() => void retrySession()}>Réessayer</Button>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className={styles.state} role="status" aria-live="polite">
        Vérification de votre session…
      </main>
    );
  }

  return children;
}
