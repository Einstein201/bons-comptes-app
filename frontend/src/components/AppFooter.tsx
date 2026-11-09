import styles from './AppFooter.module.css';

export function AppFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <span>© {new Date().getFullYear()} Les Bons Comptes</span>
        <span>Gestion partagée des dépenses</span>
      </div>
    </footer>
  );
}