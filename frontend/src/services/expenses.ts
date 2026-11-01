import { apiRequest } from './api';

// Les montants sont des entiers en centimes : 4599 = 45,99 €.
export type Expense = {
    id: string;
    title: string;
    amount: number;
    date: string;
    createdAt: string;
    paidBy: { id: string; name: string };
};

export type ExpensePage = {
    items: Expense[];
    nextCursor: string | null;
    totalAmount: number;
};

export type CreateExpenseInput = {
    title: string;
    amount: number;
    date: string;
    paidById: string;
};

function expensesPath(walletId: string): string {
    return `/wallets/${encodeURIComponent(walletId)}/expenses`;
}

export async function listExpenses(
    walletId: string,
    options: { cursor?: string; limit?: number } = {},
): Promise<ExpensePage> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set('limit', String(options.limit));
    if (options.cursor) query.set('cursor', options.cursor);
    const search = query.size > 0 ? `?${query}` : '';

    const response = await apiRequest(`${expensesPath(walletId)}${search}`);
    return (await response.json()) as ExpensePage;
}

export async function createExpense(
    walletId: string,
    input: CreateExpenseInput,
): Promise<Expense> {
    const response = await apiRequest(expensesPath(walletId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    return (await response.json()) as Expense;
}

export async function deleteExpense(walletId: string, expenseId: string): Promise<void> {
    await apiRequest(`${expensesPath(walletId)}/${encodeURIComponent(expenseId)}`, {
        method: 'DELETE',
    });
}