// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/api';
import { ExpenseForm } from './ExpenseForm';

const mocks = vi.hoisted(() => ({ createExpense: vi.fn() }));

vi.mock('../services/expenses', () => ({ createExpense: mocks.createExpense }));

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