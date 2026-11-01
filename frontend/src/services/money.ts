const currency = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
});

export function formatCents(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new Error('Le montant doit être un entier sûr en centimes.');
  }
  return currency.format(amount / 100);
}
