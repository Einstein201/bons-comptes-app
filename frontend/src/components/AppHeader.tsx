import Link from 'next/link';
import { BellIcon, WalletIcon } from './icons';
import styles from './AppHeader.module.css';

type AppHeaderProps = {
  userName?: string;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function AppHeader({ userName }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.logo}>
          <WalletIcon />
        </span>
        <span className={styles.brandName}>Les bons comptes</span>
      </Link>
      <div className={styles.actions}>
        <button type="button" className={styles.iconButton} aria-label="Notifications">
          <BellIcon />
        </button>
        {userName ? (
          <span className={styles.avatar} role="img" aria-label={`Compte de ${userName}`}>
            {getInitials(userName)}
          </span>
        ) : null}
      </div>
    </header>
  );
}
