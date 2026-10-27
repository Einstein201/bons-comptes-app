export interface MemberPayment {
  userId: string;
  name: string;
  paidAmount: number;
}

export interface PaidRepayment {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface MemberBalance {
  userId: string;
  name: string;
  paidAmount: number;
  shareAmount: number;
  balance: number;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

function byUserId(a: { userId: string }, b: { userId: string }) {
  if (a.userId < b.userId) return -1;
  if (a.userId > b.userId) return 1;
  return 0;
}

export function calculateBalances(
  totalAmount: number,
  members: MemberPayment[],
  repayments: PaidRepayment[],
) {
  const sortedMembers = [...members].sort(byUserId);
  const baseShare = Math.floor(totalAmount / sortedMembers.length);
  const remainder = totalAmount % sortedMembers.length;

  const balances: MemberBalance[] = sortedMembers.map((member, index) => {
    const shareAmount = index < remainder ? baseShare + 1 : baseShare;

    return {
      userId: member.userId,
      name: member.name,
      paidAmount: member.paidAmount,
      shareAmount,
      balance: member.paidAmount - shareAmount,
    };
  });

  for (const repayment of repayments) {
    const sender = balances.find((b) => b.userId === repayment.fromUserId);
    const recipient = balances.find((b) => b.userId === repayment.toUserId);

    if (sender) sender.balance += repayment.amount;
    if (recipient) recipient.balance -= repayment.amount;
  }

  const sum = balances.reduce((total, member) => total + member.balance, 0);
  if (sum !== 0) {
    throw new Error(
      'Le bilan est déséquilibré : la somme des soldes doit être 0.',
    );
  }

  return { balances, transfers: calculateTransfers(balances) };
}

function calculateTransfers(balances: MemberBalance[]): Transfer[] {
  const debtors = balances
    .filter((member) => member.balance < 0)
    .map((member) => ({ userId: member.userId, amount: -member.balance }));
  const creditors = balances
    .filter((member) => member.balance > 0)
    .map((member) => ({ userId: member.userId, amount: member.balance }));

  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    transfers.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amount,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) debtorIndex++;
    if (creditor.amount === 0) creditorIndex++;
  }

  return transfers;
}
