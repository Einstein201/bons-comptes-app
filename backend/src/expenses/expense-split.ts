export interface ExpenseShare {
  userId: string;
  amount: number;
}

// Répartit un montant en centimes à parts égales. Les centimes restants vont aux
// premiers membres par userId croissant (ordre binaire, identique quelle que soit
// la collation de la base).
export function splitEqually(
  amount: number,
  memberIds: string[],
): ExpenseShare[] {
  if (memberIds.length === 0) {
    throw new Error('Une dépense doit être répartie entre au moins un membre.');
  }

  const sortedIds = [...memberIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const baseShare = Math.floor(amount / sortedIds.length);
  const remainder = amount % sortedIds.length;

  const shares = sortedIds.map((userId, index) => ({
    userId,
    amount: index < remainder ? baseShare + 1 : baseShare,
  }));

  const total = shares.reduce((sum, share) => sum + share.amount, 0);
  if (total !== amount) {
    throw new Error(
      'La somme des parts doit être égale au montant de la dépense.',
    );
  }

  return shares;
}
