// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { ExpenseForm } from './ExpenseForm';

const mocks = vi.hoisted(() => ({ createExpense: vi.fn(), updateExpense: vi.fn() }));

vi.mock('../services/expenses', () => ({
    createExpense: mocks.createExpense,
    updateExpense: mocks.updateExpense,
}));

const payers = [
    { userId: 'me', name: 'Marie Dupont' },
    { userId: 'elodie', name: 'Élodie Laurent' },
];

function renderForm() {
    const props = {
        onCreated: vi.fn(),
        onClose: vi.fn(),
        onWalletClosed: vi.fn(),
    };
    render(
        <ExpenseForm walletId="wallet-1" payers={payers} currentUserId="me" {...props} />,
    );
    return props;
}

function fillForm({ title = 'Billets de train', amount = '38,00', date = '2025-06-12' } = {}) {
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: title } });
    fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
}

const submit = () => fireEvent.submit(screen.getByRole('dialog'));

describe('formulaire d’ajout de dépense', () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(cleanup);

    it('propose les membres acceptés comme payeurs, « Vous » par défaut', () => {
        renderForm();
        const select = screen.getByLabelText('Payé par') as HTMLSelectElement;
        expect([...select.options].map((option) => option.textContent))
            .toEqual(['Vous', 'Élodie Laurent']);
        expect(select.value).toBe('me');
    });

    it.each([
        ['38', 3800],
        ['12,5', 1250],
        ['4,35', 435],
        ['1,15', 115],
        ['0,29', 29],
        ['1 234,56', 123456],
    ])('envoie « %s € » comme %i centimes avec le payeur choisi', async (amount, cents) => {
        const created = { id: 'e-1', title: 'Billets de train', amount: cents };
        mocks.createExpense.mockResolvedValue(created);
        const props = renderForm();

        fillForm({ title: '  Billets de train  ', amount });
        fireEvent.change(screen.getByLabelText('Payé par'), { target: { value: 'elodie' } });
        submit();

        await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(created));
        expect(mocks.createExpense).toHaveBeenCalledWith('wallet-1', {
            title: 'Billets de train',
            amount: cents,
            date: '2025-06-12',
            paidById: 'elodie',
        });
    });

    it('refuse un montant invalide sans appeler le serveur', () => {
        renderForm();
        fillForm({ amount: '12,345' });
        submit();
        expect(screen.getByText(/2 décimales au maximum/)).toBeTruthy();
        expect(mocks.createExpense).not.toHaveBeenCalled();
    });

    it('exige une description', () => {
        renderForm();
        fillForm({ title: '   ' });
        submit();
        expect(screen.getByText('La description est obligatoire.')).toBeTruthy();
        expect(mocks.createExpense).not.toHaveBeenCalled();
    });

    it.each([
        [400, 'Certaines informations sont invalides'],
        [403, 'le payeur doit être un membre'],
        [404, 'Ce porte-monnaie est introuvable.'],
    ])('affiche l’erreur %i du serveur', async (status, message) => {
        mocks.createExpense.mockRejectedValue(new ApiError(status));
        const props = renderForm();
        fillForm();
        submit();
        expect((await screen.findByRole('alert')).textContent).toContain(message);
        expect(props.onCreated).not.toHaveBeenCalled();
    });

    it('signale un porte-monnaie clôturé (409)', async () => {
        mocks.createExpense.mockRejectedValue(new ApiError(409));
        const props = renderForm();
        fillForm();
        submit();
        await waitFor(() => expect(props.onWalletClosed).toHaveBeenCalledTimes(1));
        expect(props.onCreated).not.toHaveBeenCalled();
    });

    it('se ferme avec la touche Échap', () => {
        const props = renderForm();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });
});

const existing = {
    id: 'e-1',
    title: 'Billets de train',
    amount: 3800,
    date: '2025-06-12',
    createdAt: '2025-06-12T10:00:00.000Z',
    paidBy: { id: 'me', name: 'Marie Dupont' },
};

function renderEditForm() {
    const props = { onUpdated: vi.fn(), onClose: vi.fn(), onWalletClosed: vi.fn() };
    render(
        <ExpenseForm
            walletId="wallet-1"
            payers={payers}
            currentUserId="me"
            expense={existing}
            {...props}
        />,
    );
    return props;
}

describe('formulaire de modification de dépense', () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(cleanup);

    it('préremplit titre, montant, date et payeur ; date et payeur sont verrouillés', () => {
        renderEditForm();

        expect(screen.getByRole('heading', { name: 'Modifier la dépense' })).toBeTruthy();
        expect((screen.getByLabelText(/Description/) as HTMLInputElement).value).toBe('Billets de train');
        expect((screen.getByLabelText('Montant (€)') as HTMLInputElement).value).toBe('38,00');
        const date = screen.getByLabelText('Date') as HTMLInputElement;
        expect(date.value).toBe('2025-06-12');
        expect(date.readOnly).toBe(true);
        const payer = screen.getByLabelText('Payé par') as HTMLSelectElement;
        expect(payer.value).toBe('me');
        expect(payer.disabled).toBe(true);
    });

    it('envoie le montant en centimes, sans le titre inchangé', async () => {
        const updated = { ...existing, amount: 4599 };
        mocks.updateExpense.mockResolvedValue(updated);
        const props = renderEditForm();

        fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: '45,99' } });
        submit();

        await waitFor(() => expect(props.onUpdated).toHaveBeenCalledWith(updated, existing));
        expect(mocks.updateExpense).toHaveBeenCalledWith('wallet-1', 'e-1', { amount: 4599 });
    });

    it('envoie le titre nettoyé et le montant quand les deux changent', async () => {
        mocks.updateExpense.mockResolvedValue({ ...existing, title: 'TGV', amount: 100 });
        renderEditForm();

        fireEvent.change(screen.getByLabelText(/Description/), { target: { value: '  TGV  ' } });
        fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: '1' } });
        submit();

        await waitFor(() => expect(mocks.updateExpense).toHaveBeenCalledWith('wallet-1', 'e-1', {
            title: 'TGV', amount: 100,
        }));
    });

    it('se ferme sans appel serveur quand rien n’a changé', () => {
        const props = renderEditForm();

        submit();

        expect(props.onClose).toHaveBeenCalledTimes(1);
        expect(mocks.updateExpense).not.toHaveBeenCalled();
        expect(props.onUpdated).not.toHaveBeenCalled();
    });

    it.each([
        ['montant invalide', { amount: '12,345' }, /2 décimales au maximum/],
        ['montant nul', { amount: '0' }, /montant positif/],
        ['description vide', { title: '   ' }, /description est obligatoire/],
    ])('refuse un(e) %s sans appeler le serveur', (_label, change, message) => {
        renderEditForm();
        if ('amount' in change) {
            fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: change.amount } });
        }
        if ('title' in change) {
            fireEvent.change(screen.getByLabelText(/Description/), { target: { value: change.title } });
        }

        submit();

        expect(screen.getByText(message)).toBeTruthy();
        expect(mocks.updateExpense).not.toHaveBeenCalled();
    });

    it.each([
        [400, [], 'Vérifiez le titre et le montant'],
        [403, [], 'Seul le payeur peut modifier cette dépense.'],
        [404, [], 'Cette dépense ou ce porte-monnaie est introuvable.'],
        [409, ['Le montant ne peut pas être modifié car la dépense possède déjà une répartition.'], 'a déjà une répartition'],
    ])('affiche l’erreur %i du serveur', async (status, messages, text) => {
        mocks.updateExpense.mockRejectedValue(new ApiError(status, messages));
        const props = renderEditForm();
        fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: '40' } });

        submit();

        expect((await screen.findByRole('alert')).textContent).toContain(text);
        expect(props.onUpdated).not.toHaveBeenCalled();
        expect(props.onWalletClosed).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('signale un porte-monnaie clôturé (409 sans mention de répartition)', async () => {
        mocks.updateExpense.mockRejectedValue(new ApiError(409, ['Ce porte-monnaie est fermé.']));
        const props = renderEditForm();
        fireEvent.change(screen.getByLabelText('Montant (€)'), { target: { value: '40' } });

        submit();

        await waitFor(() => expect(props.onWalletClosed).toHaveBeenCalledTimes(1));
        expect(props.onUpdated).not.toHaveBeenCalled();
    });
});
