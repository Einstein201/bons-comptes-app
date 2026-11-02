import { AppHeader } from '../../../components/AppHeader';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { WalletBalance } from '../../../components/WalletBalance';
import { WalletDetail } from '../../../components/WalletDetail';
import styles from './page.module.css';

export default async function WalletPage({
                                             params,
                                         }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return (
        <ProtectedRoute>
            <AppHeader />
            <main className={styles.main}>
                <WalletBalance key={id} walletId={id}>
                    <WalletDetail walletId={id} />
                </WalletBalance>
            </main>
        </ProtectedRoute>
    );
}