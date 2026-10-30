import { calculateBalances, type MemberPayment } from './balance-calculator.js';

export interface PairAmount {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface PlannedTransfer {
  fromUserId: string;
  toUserId: string;
  initialAmount: number;
  remainingAmount: number;
  declarableAmount: number;
}

interface RepaymentPlanData {
  totalAmount: number;
  memberPayments: MemberPayment[];
  paidRepayments: PairAmount[];
  pendingRepayments: PairAmount[];
}

function amountOfPair(
  repayments: PairAmount[],
  fromUserId: string,
  toUserId: string,
) {
  return repayments
    .filter(
      (repayment) =>
        repayment.fromUserId === fromUserId && repayment.toUserId === toUserId,
    )
    .reduce((total, repayment) => total + repayment.amount, 0);
}

// Option A : les paires viennent du plan initial, calculé sans remboursements.
// Elles ne changent donc pas après la confirmation d'un remboursement.
export function calculateRepaymentPlan(
  data: RepaymentPlanData,
): PlannedTransfer[] {
  const { transfers } = calculateBalances(
    data.totalAmount,
    data.memberPayments,
    [],
  );

  return transfers.map((transfer) => {
    const paid = amountOfPair(
      data.paidRepayments,
      transfer.fromUserId,
      transfer.toUserId,
    );
    const pending = amountOfPair(
      data.pendingRepayments,
      transfer.fromUserId,
      transfer.toUserId,
    );

    return {
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      initialAmount: transfer.amount,
      remainingAmount: transfer.amount - paid,
      declarableAmount: transfer.amount - paid - pending,
    };
  });
}
