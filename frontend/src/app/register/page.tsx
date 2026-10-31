import type { Metadata } from 'next';
import { AppHeader } from '../../components/AppHeader';
import { AuthForm } from '../../components/AuthForm';
import styles from '../auth-page.module.css';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <AppHeader />
      <AuthForm mode="register" />
    </main>
  );
}
