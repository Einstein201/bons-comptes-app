import type { Metadata } from 'next';
import { AppHeader } from '../../../components/AppHeader';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { WalletDetail } from '../../../components/WalletDetail';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Porte-monnaie',
};

export default async function WalletPage({
                                             params,
                                         }: {
    params: Promise<{ walletId: string }>;
}) {
    const { walletId } = await params;

    return (
        <ProtectedRoute>
            <div className={styles.page}>
                <AppHeader />
                <main>
                    <WalletDetail walletId={walletId} />
                </main>
            </div>
        </ProtectedRoute>
    );
}