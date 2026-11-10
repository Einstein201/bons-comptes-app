import type { Metadata } from 'next';
import { AppHeader } from '../components/AppHeader';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { WalletDashboard } from '../components/WalletDashboard';
import styles from './dashboard-page.module.css';

export const metadata: Metadata = {
  title: 'Mes porte-monnaie',
};

// `tab` permet d'ouvrir directement l'onglet des invitations, par exemple depuis une notification.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const initialSection = tab === 'invitations' ? 'invitations' : 'open';

  return (
    <ProtectedRoute>
      <div className={styles.page}>
        <AppHeader />
        <div className={styles.content}>
          <WalletDashboard key={initialSection} initialSection={initialSection} />
        </div>
      </div>
    </ProtectedRoute>
  );
}
