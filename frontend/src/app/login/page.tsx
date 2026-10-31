import type { Metadata } from 'next';
import { AppHeader } from '../../components/AppHeader';
import { AuthForm } from '../../components/AuthForm';
import styles from '../auth-page.module.css';

export const metadata: Metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <AppHeader />
      <AuthForm mode="login" />
    </main>
  );
}
