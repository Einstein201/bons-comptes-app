import type { Metadata } from 'next';
import { AppHeader } from '../../../components/AppHeader';
import { WalletForm } from '../../../components/WalletForm';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Créer un porte-monnaie',
};

export default function NewWalletPage() {
  return (
    <div className={styles.page}>
      {/* TODO : remplacer par l'utilisateur authentifié quand l'authentification existera. */}
      <AppHeader userName="Marie Dupont" />
      <main className={styles.main}>
        <p className={styles.eyebrow}>Nouveau porte-monnaie</p>
        <h1 className={styles.title}>
          Créer un <span className={styles.nowrap}>porte-monnaie</span>
        </h1>
        <p className={styles.subtitle}>
          Rassemblez vos dépenses et invitez les personnes concernées.
        </p>
        <WalletForm />
      </main>
    </div>
  );
}
