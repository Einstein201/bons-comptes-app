import type { Metadata } from 'next';
import { AppHeader } from '../components/AppHeader';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { WalletDashboard } from '../components/WalletDashboard';
import styles from './dashboard-page.module.css';

export const metadata: Metadata = {
  title: 'Mes porte-monnaie',
};

export default function HomePage() {
  return (
    <ProtectedRoute>
      <div className={styles.page}>
        <AppHeader />
        <WalletDashboard />
      </div>
    </ProtectedRoute>
  );
}
