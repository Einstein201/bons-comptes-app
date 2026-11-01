// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import type { Expense } from '../services/expenses';
import { mergeExpenses, WalletDetail } from './WalletDetail';

const mocks = vi.hoisted(() => ({
    getWalletDetails: vi.fn(),
    listExpenses: vi.fn(),
    deleteExpense: vi.fn(),
    createExpense: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { userId: 'me' } }),
}));
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
        vi.clearAllMocks();
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
        expect(screen.getByText('Clôturé')).toBeTruthy();
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

    it('affiche l’erreur 400 si la page suivante est refusée', async () => {
        mocks.listExpenses
            .mockResolvedValueOnce({ items: [expense('e-1', '2025-06-12', 100)], nextCursor: 'bad', totalAmount: 200 })
            .mockRejectedValueOnce(new ApiError(400));

        render(<WalletDetail walletId="wallet-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus de dépenses' }));

        expect((await screen.findByRole('alert')).textContent).toContain('La demande est invalide');
        expect(titles()).toEqual(['Dépense e-1']);
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