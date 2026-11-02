import type { Metadata } from 'next';
import { AppHeader } from '../../components/AppHeader';
import { InvitationsPanel } from '../../components/InvitationsPanel';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Invitations reçues',
};

export default function InvitationsPage() {
  return (
    <ProtectedRoute>
      <AppHeader />
      <main className={styles.main}>
        <h1>Invitations reçues</h1>
        <InvitationsPanel />
      </main>
    </ProtectedRoute>
  );
}
