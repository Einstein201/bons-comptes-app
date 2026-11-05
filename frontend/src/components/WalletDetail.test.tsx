// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import type { Expense } from '../services/expenses';
import { mergeExpenses, WalletDetail } from './WalletDetail';
import { WalletTabProvider } from './WalletTabs';

const mocks = vi.hoisted(() => ({
    getWalletDetails: vi.fn(),
    listExpenses: vi.fn(),
    deleteExpense: vi.fn(),
    createExpense: vi.fn(),
    sendInvitation: vi.fn(),
    leaveWallet: vi.fn(),
    removeMember: vi.fn(),
    push: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { userId: 'me' } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../services/memberships', () => ({
    leaveWallet: mocks.leaveWallet,
    removeMember: mocks.removeMember,
}));
vi.mock('../services/invitations', () => ({ sendInvitation: mocks.sendInvitation }));
vi.mock('../services/wallets', () => ({ getWalletDetails: mocks.getWalletDetails }));
vi.mock('../services/expenses', () => ({
    listExpenses: mocks.listExpenses,
    deleteExpense: mocks.deleteExpense,
    createExpense: mocks.createExpense,
}));

// Intl utilise des espaces insécables : on les remplace pour comparer facilement.
const plain = (text: string | null) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ');

function expense(id: string, date: string, amount: number, payerId = 'me', title = `Dépense ${id}`): Expense {
    return {
        id, title, amount, date, createdAt: '2025-06-30T10:00:00.000Z',
        paidBy: { id: payerId, name: payerId === 'me' ? 'Marie' : 'Chloé Martin' },
    };
}

const member = (userId: string, name: string, status = 'MEMBER') => ({
    userId, name, email: `${userId}@exemple.fr`, status,
    invitedAt: '2025-05-01T00:00:00.000Z', acceptedAt: null,
});

function givenWallet(status: 'OPEN' | 'CLOSED' = 'OPEN') {
    mocks.getWalletDetails.mockResolvedValue({
        wallet: { id: 'wallet-1', title: 'Voyage à Lisbonne', description: null, status, createdAt: '' },
        members: [
            member('me', 'Marie Dupont'),
            member('chloe', 'Chloé Martin'),
            member('invited', 'Paul Invité', 'INVITED'),
        ],
    });
}

const titles = () =>
    screen.getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent)
        .filter(Boolean);

describe('détail d’un porte-monnaie', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        givenWallet();
    });
    afterEach(cleanup);

    it('affiche les dépenses, leur payeur et le total renvoyé par le backend', async () => {
        mocks.listExpenses.mockResolvedValue({
            items: [
                expense('e-2', '2025-06-21', 5136, 'me', 'Dîner chez Marcel'),
                expense('e-1', '2025-05-28', 3160, 'chloe', 'Électricité'),
            ],
            nextCursor: null,
            totalAmount: 31112,
        });

        render(<WalletDetail walletId="wallet-1" />);

        expect(await screen.findByText('Dîner chez Marcel')).toBeTruthy();
        expect(screen.getByText('Payé par vous')).toBeTruthy();
        expect(screen.getByText('Payé par Chloé Martin')).toBeTruthy();
        expect(screen.getByText('Juin 2025')).toBeTruthy();
        expect(screen.getByText('Mai 2025')).toBeTruthy();
        expect(plain(screen.getByText(/51,36/).textContent)).toBe('51,36 €');
        // Total général du backend, pas la somme des lignes affichées.
        expect(plain(screen.getByText(/311,12/).textContent)).toBe('311,12 €');
        expect(screen.queryByRole('button', { name: 'Afficher plus de dépenses' })).toBeNull();
    });

    it('charge la page suivante avec le curseur, sans doublon', async () => {
        mocks.listExpenses
            .mockResolvedValueOnce({
                items: [expense('e-3', '2025-06-21', 100), expense('e-2', '2025-06-18', 100)],
                nextCursor: 'cursor-1',
                totalAmount: 300,
            })
            .mockResolvedValueOnce({
                // e-2 est renvoyée une seconde fois : elle ne doit apparaître qu'une fois.
                items: [expense('e-2', '2025-06-18', 100), expense('e-1', '2025-06-12', 100)],
                nextCursor: null,
                totalAmount: 300,
            });

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus de dépenses' }));

        await screen.findByText('Dépense e-1');
        expect(mocks.listExpenses).toHaveBeenLastCalledWith('wallet-1', { cursor: 'cursor-1' });
        expect(titles()).toEqual(['Dépense e-3', 'Dépense e-2', 'Dépense e-1']);
        expect(screen.queryByRole('button', { name: 'Afficher plus de dépenses' })).toBeNull();
    });

    it('ne propose la suppression que pour les dépenses payées par l’utilisateur', async () => {
        mocks.listExpenses.mockResolvedValue({
            items: [expense('e-2', '2025-06-21', 100, 'me', 'À moi'), expense('e-1', '2025-06-18', 100, 'chloe', 'À Chloé')],
            nextCursor: null,
            totalAmount: 200,
        });

        render(<WalletDetail walletId="wallet-1" />);
        await screen.findByText('À moi');

        expect(screen.getByRole('button', { name: 'Supprimer la dépense « À moi »' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Supprimer la dépense « À Chloé »' })).toBeNull();
    });

    it('supprime une dépense après confirmation et met le total à jour', async () => {
        mocks.listExpenses.mockResolvedValue({
            items: [expense('e-1', '2025-06-21', 3800, 'me', 'Billets de train')],
            nextCursor: null,
            totalAmount: 5000,
        });
        mocks.deleteExpense.mockResolvedValue(undefined);

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la dépense « Billets de train »' }));
        expect(mocks.deleteExpense).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

        expect((await screen.findByRole('status')).textContent).toContain('a été supprimée');
        expect(mocks.deleteExpense).toHaveBeenCalledWith('wallet-1', 'e-1');
        expect(screen.queryByText('Billets de train')).toBeNull();
        expect(plain(screen.getByText(/12,00/).textContent)).toBe('12,00 €');
    });

    it.each([
        [403, 'Seul le payeur peut supprimer cette dépense.', true],
        [404, 'Cette dépense n’existe plus.', false],
    ])('affiche l’erreur %i lors d’une suppression', async (status, message, stillVisible) => {
        mocks.listExpenses.mockResolvedValue({
            items: [expense('e-1', '2025-06-21', 100, 'me', 'Courses')],
            nextCursor: null,
            totalAmount: 100,
        });
        mocks.deleteExpense.mockRejectedValue(new ApiError(status));

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la dépense « Courses »' }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

        expect((await screen.findByRole('alert')).textContent).toContain(message);
        expect(screen.queryByText('Courses') !== null).toBe(stillVisible);
    });

    it('bascule en lecture seule si le serveur répond 409 à une suppression', async () => {
        mocks.listExpenses.mockResolvedValue({
            items: [expense('e-1', '2025-06-21', 100, 'me', 'Courses')],
            nextCursor: null,
            totalAmount: 100,
        });
        mocks.deleteExpense.mockRejectedValue(new ApiError(409));

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la dépense « Courses »' }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

        expect((await screen.findByRole('alert')).textContent).toContain('vient d’être clôturé');
        expect(screen.getByRole('status').textContent).toContain('Ce porte-monnaie est clôturé');
        expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Ajouter une dépense/ })).toBeNull();
    });

    it('présente un porte-monnaie clôturé en lecture seule', async () => {
        givenWallet('CLOSED');
        mocks.listExpenses.mockResolvedValue({
            items: [expense('e-1', '2025-06-21', 100, 'me', 'Courses')],
            nextCursor: null,
            totalAmount: 100,
        });

        render(<WalletDetail walletId="wallet-1" />);

        expect(await screen.findByText('Courses')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('Ce porte-monnaie est clôturé');
        expect(screen.queryByRole('button', { name: /Ajouter une dépense/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
    });

    it('ajoute une dépense et l’insère dans la liste avec le nouveau total', async () => {
        mocks.listExpenses.mockResolvedValue({
            items: [expense('e-1', '2025-06-12', 3800)],
            nextCursor: null,
            totalAmount: 3800,
        });
        mocks.createExpense.mockResolvedValue(expense('e-2', '2025-06-21', 435, 'chloe', 'Café'));

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: /Ajouter une dépense/ }));

        const dialog = screen.getByRole('dialog');
        const options = within(dialog).getAllByRole('option').map((option) => option.textContent);
        expect(options).toEqual(['Vous', 'Chloé Martin']);

        fireEvent.change(within(dialog).getByLabelText(/Description/), { target: { value: 'Café' } });
        fireEvent.change(within(dialog).getByLabelText('Montant (€)'), { target: { value: '4,35' } });
        fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2025-06-21' } });
        fireEvent.change(within(dialog).getByLabelText('Payé par'), { target: { value: 'chloe' } });
        fireEvent.submit(dialog);

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(mocks.createExpense).toHaveBeenCalledWith('wallet-1', {
            title: 'Café', amount: 435, date: '2025-06-21', paidById: 'chloe',
        });
        expect(titles()).toEqual(['Café', 'Dépense e-1']);
        expect(plain(screen.getByText(/42,35/).textContent)).toBe('42,35 €');
    });

    it.each([
        [403, 'Vous n’avez pas accès à ce porte-monnaie.'],
        [404, 'Ce porte-monnaie est introuvable.'],
    ])('affiche l’erreur %i au chargement', async (status, message) => {
        mocks.getWalletDetails.mockRejectedValue(new ApiError(status));
        mocks.listExpenses.mockRejectedValue(new ApiError(status));

        render(<WalletDetail walletId="wallet-1" />);

        expect((await screen.findByRole('alert')).textContent).toContain(message);
    });

    it('garde le bouton de pagination quand toutes les dépenses affichées sont supprimées', async () => {
        mocks.listExpenses
            .mockResolvedValueOnce({
                items: [expense('e-2', '2025-06-21', 100, 'me', 'Courses')],
                nextCursor: 'cursor-1',
                totalAmount: 300,
            })
            .mockResolvedValueOnce({
                items: [expense('e-1', '2025-06-12', 200, 'chloe', 'Électricité')],
                nextCursor: null,
                totalAmount: 200,
            });
        mocks.deleteExpense.mockResolvedValue(undefined);

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la dépense « Courses »' }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        await waitFor(() => expect(screen.queryByText('Courses')).toBeNull());

        fireEvent.click(screen.getByRole('button', { name: 'Afficher plus de dépenses' }));

        expect(await screen.findByText('Électricité')).toBeTruthy();
        expect(mocks.listExpenses).toHaveBeenLastCalledWith('wallet-1', { cursor: 'cursor-1' });
    });

    it('garde le total à jour quand une suppression se termine pendant le chargement de la page suivante', async () => {
        let resolveNextPage!: (page: unknown) => void;
        mocks.listExpenses
            .mockResolvedValueOnce({
                items: [expense('e-2', '2025-06-21', 1000, 'me', 'Courses')],
                nextCursor: 'cursor-1',
                totalAmount: 5000,
            })
            .mockReturnValueOnce(new Promise((resolve) => { resolveNextPage = resolve; }));
        mocks.deleteExpense.mockResolvedValue(undefined);

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus de dépenses' }));

        fireEvent.click(screen.getByRole('button', { name: 'Supprimer la dépense « Courses »' }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        await screen.findByText(/a été supprimée/);
        expect(plain(screen.getByText(/40,00/).textContent)).toBe('40,00 €');

        // La page suivante arrive après la suppression, avec le total d'avant.
        resolveNextPage({
            items: [expense('e-1', '2025-06-12', 1500, 'chloe', 'Électricité')],
            nextCursor: null,
            totalAmount: 5000,
        });

        expect(await screen.findByText('Électricité')).toBeTruthy();
        expect(plain(screen.getByText(/40,00/).textContent)).toBe('40,00 €');
        expect(screen.queryByText(/50,00/)).toBeNull();
    });

    it('n’affiche plus l’ancien porte-monnaie quand l’identifiant change', async () => {
        mocks.listExpenses.mockResolvedValueOnce({
            items: [expense('e-1', '2025-06-12', 100, 'me', 'Courses')],
            nextCursor: null,
            totalAmount: 100,
        });
        const { rerender } = render(<WalletDetail walletId="wallet-1" />);
        await screen.findByText('Courses');

        mocks.getWalletDetails.mockReturnValue(new Promise(() => {}));
        mocks.listExpenses.mockReturnValue(new Promise(() => {}));
        rerender(<WalletDetail walletId="wallet-2" />);

        expect(screen.getByRole('status').textContent).toContain('Chargement du porte-monnaie');
        expect(screen.queryByText('Voyage à Lisbonne')).toBeNull();
        expect(screen.queryByText('Courses')).toBeNull();
        expect(mocks.getWalletDetails).toHaveBeenLastCalledWith('wallet-2');
    });

    it('affiche l’erreur 400 si la page suivante est refusée', async () => {
        mocks.listExpenses
            .mockResolvedValueOnce({ items: [expense('e-1', '2025-06-12', 100)], nextCursor: 'bad', totalAmount: 200 })
            .mockRejectedValueOnce(new ApiError(400));

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus de dépenses' }));

        expect((await screen.findByRole('alert')).textContent).toContain('La demande est invalide');
        expect(titles()).toEqual(['Dépense e-1']);
    });

    describe('membres et invitations', () => {
        const withCreator = (isCreator: boolean, status: 'OPEN' | 'CLOSED' = 'OPEN') => {
            mocks.getWalletDetails.mockResolvedValue({
                wallet: { id: 'wallet-1', title: 'Voyage', description: null, status, createdAt: '', isCreator },
                members: [member('me', 'Marie Dupont'), member('invited', 'Paul Invité', 'INVITED')],
            });
            mocks.listExpenses.mockResolvedValue({ items: [], nextCursor: null, totalAmount: 0 });
        };

        it('liste les membres avec leur statut', async () => {
            withCreator(false);
            render(<WalletDetail walletId="wallet-1" />);

            const list = await screen.findByRole('list', { name: 'Détail des membres' });
            expect(within(list).getByText('Marie Dupont')).toBeDefined();
            expect(within(list).getByText('Membre')).toBeDefined();
            expect(within(list).getByText('Paul Invité')).toBeDefined();
            expect(within(list).getByText('Invitation en attente')).toBeDefined();
        });

        it('réserve le formulaire d’invitation au créateur d’un porte-monnaie ouvert', async () => {
            withCreator(true);
            render(<WalletDetail walletId="wallet-1" />);

            expect(await screen.findByRole('button', { name: 'Envoyer l’invitation' })).toBeDefined();
        });

        it.each([
            ['simple membre', false, 'OPEN'],
            ['porte-monnaie clôturé', true, 'CLOSED'],
        ] as const)('masque le formulaire pour un %s', async (_label, isCreator, status) => {
            withCreator(isCreator, status);
            render(<WalletDetail walletId="wallet-1" />);

            await screen.findByRole('list', { name: 'Détail des membres' });
            expect(screen.queryByRole('button', { name: 'Envoyer l’invitation' })).toBeNull();
        });

        it('recharge les membres après l’envoi d’une invitation', async () => {
            withCreator(true);
            mocks.sendInvitation.mockResolvedValue({});
            render(<WalletDetail walletId="wallet-1" />);

            await screen.findByRole('button', { name: 'Envoyer l’invitation' });
            fireEvent.change(screen.getByLabelText(/Adresse email/), { target: { value: 'bob@example.com' } });
            fireEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

            await screen.findByText('Une invitation a été envoyée à bob@example.com.');
            expect(mocks.sendInvitation).toHaveBeenCalledWith('wallet-1', 'bob@example.com');
            await waitFor(() => expect(mocks.getWalletDetails).toHaveBeenCalledTimes(2));
        });
    });

    describe('quitter et retirer un membre', () => {
        const withMembers = (isCreator: boolean, status: 'OPEN' | 'CLOSED' = 'OPEN') => {
            mocks.getWalletDetails.mockResolvedValue({
                wallet: { id: 'wallet-1', title: 'Voyage', description: null, status, createdAt: '', isCreator },
                members: [
                    member('me', 'Marie Dupont'),
                    member('chloe', 'Chloé Martin'),
                    member('invited', 'Paul Invité', 'INVITED'),
                ],
            });
            mocks.listExpenses.mockResolvedValue({ items: [], nextCursor: null, totalAmount: 0 });
        };
        const leaveButton = () => screen.queryByRole('button', { name: 'Quitter le porte-monnaie' });
        const confirm = (name: string) =>
            fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }));

        it('propose « Quitter » à un membre, pas « Retirer »', async () => {
            withMembers(false);
            render(<WalletDetail walletId="wallet-1" />);

            await screen.findByRole('list', { name: 'Détail des membres' });
            expect(leaveButton()).not.toBeNull();
            expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();
        });

        it('ne propose pas « Quitter » au créateur, mais « Retirer » sur les autres membres acceptés', async () => {
            withMembers(true);
            render(<WalletDetail walletId="wallet-1" />);

            await screen.findByRole('list', { name: 'Détail des membres' });
            expect(leaveButton()).toBeNull();
            expect(screen.getByRole('button', { name: 'Retirer Chloé Martin' })).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Retirer Marie Dupont' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Retirer Paul Invité' })).toBeNull();
        });

        it.each([[false], [true]])('n’affiche aucun bouton sur un porte-monnaie clos (créateur : %s)', async (isCreator) => {
            withMembers(isCreator, 'CLOSED');
            render(<WalletDetail walletId="wallet-1" />);

            await screen.findByRole('list', { name: 'Détail des membres' });
            expect(leaveButton()).toBeNull();
            expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();
        });

        it('demande confirmation puis redirige vers le tableau de bord après avoir quitté', async () => {
            withMembers(false);
            mocks.leaveWallet.mockResolvedValue(undefined);
            render(<WalletDetail walletId="wallet-1" />);

            fireEvent.click(await screen.findByRole('button', { name: 'Quitter le porte-monnaie' }));
            const dialog = screen.getByRole('dialog', { name: 'Quitter le porte-monnaie' });
            expect(dialog.textContent).toContain('Vous allez quitter « Voyage »');
            expect(mocks.leaveWallet).not.toHaveBeenCalled();

            confirm('Quitter le porte-monnaie');

            await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'));
            expect(mocks.leaveWallet).toHaveBeenCalledWith('wallet-1');
        });

        it('annuler ne déclenche aucune action', async () => {
            withMembers(false);
            render(<WalletDetail walletId="wallet-1" />);

            fireEvent.click(await screen.findByRole('button', { name: 'Quitter le porte-monnaie' }));
            confirm('Annuler');

            expect(screen.queryByRole('dialog')).toBeNull();
            expect(mocks.leaveWallet).not.toHaveBeenCalled();
            expect(mocks.push).not.toHaveBeenCalled();
        });

        it('retire un membre après confirmation et met la liste à jour', async () => {
            withMembers(true);
            mocks.removeMember.mockResolvedValue(undefined);
            render(<WalletDetail walletId="wallet-1" />);

            fireEvent.click(await screen.findByRole('button', { name: 'Retirer Chloé Martin' }));
            expect(screen.getByRole('dialog').textContent).toContain('Chloé Martin sera retiré(e) de « Voyage »');
            confirm('Retirer le membre');

            await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
            expect(mocks.removeMember).toHaveBeenCalledWith('wallet-1', 'chloe');
            const list = screen.getByRole('list', { name: 'Détail des membres' });
            expect(within(list).queryByText('Chloé Martin')).toBeNull();
            expect(within(list).getByText('Marie Dupont')).toBeTruthy();
            expect(screen.getByRole('status').textContent).toContain('Chloé Martin a été retiré(e)');
            expect(mocks.push).not.toHaveBeenCalled();
        });

        it('affiche le message de l’API pour un historique commun (409) et garde la modale ouverte', async () => {
            withMembers(true);
            mocks.removeMember.mockRejectedValue(
                new ApiError(409, ['Ce porte-monnaie contient des dépenses partagées.']),
            );
            render(<WalletDetail walletId="wallet-1" />);

            fireEvent.click(await screen.findByRole('button', { name: 'Retirer Chloé Martin' }));
            confirm('Retirer le membre');

            const dialog = screen.getByRole('dialog');
            expect((await within(dialog).findByRole('alert')).textContent)
                .toContain('Ce porte-monnaie contient des dépenses partagées.');
            expect(within(dialog).getByRole('button', { name: 'Retirer le membre' })).toHaveProperty('disabled', false);
            expect(screen.getByRole('button', { name: 'Retirer Chloé Martin' })).toBeTruthy();
        });

        it.each([
            [403, 'Seul le créateur du porte-monnaie peut retirer un membre.'],
            [404, 'Ce membre n’existe plus dans ce porte-monnaie.'],
        ])('affiche l’erreur %i d’un retrait', async (status, message) => {
            withMembers(true);
            mocks.removeMember.mockRejectedValue(new ApiError(status));
            render(<WalletDetail walletId="wallet-1" />);

            fireEvent.click(await screen.findByRole('button', { name: 'Retirer Chloé Martin' }));
            confirm('Retirer le membre');

            expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toContain(message);
        });

        it.each([
            [403, 'le créateur ne peut pas le quitter'],
            [404, 'Ce porte-monnaie est introuvable.'],
            [409, 'dépenses partagées'],
        ])('affiche l’erreur %i en quittant, sans redirection', async (status, message) => {
            withMembers(false);
            mocks.leaveWallet.mockRejectedValue(
                new ApiError(status, status === 409 ? ['Ce porte-monnaie contient des dépenses partagées.'] : []),
            );
            render(<WalletDetail walletId="wallet-1" />);

            fireEvent.click(await screen.findByRole('button', { name: 'Quitter le porte-monnaie' }));
            confirm('Quitter le porte-monnaie');

            expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toContain(message);
            expect(mocks.push).not.toHaveBeenCalled();
        });

        it('bascule en lecture seule si le porte-monnaie vient d’être clôturé (409)', async () => {
            withMembers(false);
            mocks.leaveWallet.mockRejectedValue(new ApiError(409, ['Ce porte-monnaie est fermé.']));
            render(<WalletDetail walletId="wallet-1" />);

            fireEvent.click(await screen.findByRole('button', { name: 'Quitter le porte-monnaie' }));
            confirm('Quitter le porte-monnaie');

            expect((await screen.findByText(/vient d’être clôturé/)).textContent).toBeTruthy();
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(leaveButton()).toBeNull();
            expect(mocks.push).not.toHaveBeenCalled();
        });
    });

    describe('onglets', () => {
        const load = () => {
            mocks.getWalletDetails.mockResolvedValue({
                wallet: { id: 'wallet-1', title: 'Voyage', description: null, status: 'OPEN', createdAt: '', isCreator: true },
                members: [member('me', 'Marie Dupont')],
            });
            mocks.listExpenses.mockResolvedValue({ items: [], nextCursor: null, totalAmount: 0 });
        };

        it('n’affiche que les membres dans l’onglet Membres', async () => {
            load();
            render(<WalletTabProvider value="members"><WalletDetail walletId="wallet-1" /></WalletTabProvider>);

            await screen.findByRole('list', { name: 'Détail des membres' });
            expect(screen.queryByRole('button', { name: /Ajouter une dépense/ })).toBeNull();
            expect(screen.queryByText('Total des dépenses :')).toBeNull();
        });

        it('n’affiche que les dépenses dans l’onglet Dépenses', async () => {
            load();
            render(<WalletTabProvider value="expenses"><WalletDetail walletId="wallet-1" /></WalletTabProvider>);

            await screen.findByText('Total des dépenses :');
            expect(screen.queryByRole('list', { name: 'Détail des membres' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Envoyer l’invitation' })).toBeNull();
        });

        it('n’affiche rien dans les onglets de clôture et de remboursements', () => {
            load();
            const { container } = render(
                <WalletTabProvider value="closure"><WalletDetail walletId="wallet-1" /></WalletTabProvider>,
            );

            expect(container.textContent).toBe('');
        });
    });
});

describe('mergeExpenses', () => {
    it('fusionne sans doublon et trie par date puis identifiant décroissants', () => {
        const merged = mergeExpenses(
            [expense('b', '2025-06-12', 1), expense('a', '2025-06-10', 1)],
            [expense('a', '2025-06-10', 1), expense('c', '2025-06-12', 1), expense('d', '2025-06-20', 1)],
        );
        expect(merged.map((item) => item.id)).toEqual(['d', 'c', 'b', 'a']);
    });
});