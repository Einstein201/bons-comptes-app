export const MAX_AMOUNT_CENTS = 2_147_483_647;

const euroFormatter = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
});

// Conversion à partir du texte saisi : en JavaScript, 4.35 * 100 = 434.99999999999994.
export function parseAmountToCents(input: string): number | null {
    const normalized = input
        .replace(/€/g, '')
        .replace(/[\s\u00a0\u202f]/g, '')
        .replace(',', '.');

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        return null;
    }

    const [euros, decimals = ''] = normalized.split('.');
    const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));

    if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_AMOUNT_CENTS) {
        return null;
    }

    return cents;
}

export function formatCents(cents: number): string {
    return euroFormatter.format(cents / 100);
}