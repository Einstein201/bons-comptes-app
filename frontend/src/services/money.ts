const currency = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

export function formatCents(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new Error('Le montant doit être un entier sûr en centimes.');
  }
  return currency.format(amount / 100);
}
