import { BadRequestException, Injectable } from '@nestjs/common';
import { WalletMemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ExpenseSplitInput {
  userId: string;
  amount: number;
}

export interface ValidateExpenseInput {
  walletId: string;
  amount: number;
  paidById: string;
  createdById: string;
  splits: ExpenseSplitInput[];
}

export interface ValidateRepaymentInput {
  walletId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
}

@Injectable()
export class FinancialRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async validateExpense(input: ValidateExpenseInput): Promise<void> {
    this.assertIntegerAmount(input.amount);

    const splitUserIds = input.splits.map((split) => split.userId);
    if (new Set(splitUserIds).size !== splitUserIds.length) {
      throw new BadRequestException(
        'Un utilisateur ne peut avoir qu’une seule part par dépense.',
      );
    }

    let splitTotal = 0;
    for (const split of input.splits) {
      this.assertIntegerAmount(split.amount);
      splitTotal += split.amount;
      if (!Number.isSafeInteger(splitTotal)) {
        throw new BadRequestException('Le total des parts dépasse la limite sûre.');
      }
    }

    if (splitTotal !== input.amount) {
      throw new BadRequestException(
        'Le total des parts doit être égal au montant de la dépense.',
      );
    }

    await this.assertMembers(input.walletId, [
      input.paidById,
      input.createdById,
      ...splitUserIds,
    ]);
  }

  async validateRepayment(input: ValidateRepaymentInput): Promise<void> {
    this.assertIntegerAmount(input.amount);

    if (input.fromUserId === input.toUserId) {
      throw new BadRequestException(
        'Un remboursement ne peut pas être adressé à soi-même.',
      );
    }

    await this.assertMembers(input.walletId, [
      input.fromUserId,
      input.toUserId,
    ]);
  }

  private assertIntegerAmount(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'Les montants doivent être des nombres entiers positifs de centimes.',
      );
    }
  }

  private async assertMembers(
    walletId: string,
    userIds: string[],
  ): Promise<void> {
    const requiredUserIds = [...new Set(userIds)];
    const members = await this.prisma.walletMember.findMany({
      where: {
        walletId,
        userId: { in: requiredUserIds },
        status: WalletMemberStatus.MEMBER,
      },
      select: { userId: true },
    });

    if (members.length !== requiredUserIds.length) {
      throw new BadRequestException(
        'Les utilisateurs concernés doivent être membres du portefeuille.',
      );
    }
  }
}
