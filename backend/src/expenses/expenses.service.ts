import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateExpenseDto } from './dto/create-expense.dto.js';

const expenseSelect = {
  id: true,
  title: true,
  amount: true,
  date: true,
  createdAt: true,
  paidBy: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ExpenseSelect;

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;

function toExpenseItem(expense: ExpenseRow) {
  return {
    ...expense,
    date: expense.date.toISOString().slice(0, 10),
  };
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(walletId: string, userId: string, dto: CreateExpenseDto) {
    const wallet = await this.findWalletOfMember(walletId, userId);

    if (wallet.status !== 'OPEN') {
      throw new ConflictException('Ce porte-monnaie est fermé.');
    }

    const paidById = dto.paidById ?? userId;

    if (paidById !== userId && !(await this.isMember(walletId, paidById))) {
      throw new ForbiddenException(
        'Le payeur doit être un membre du porte-monnaie.',
      );
    }

    const expense = await this.prisma.$transaction(async (transaction) => {
      const createdExpense = await transaction.expense.create({
        data: {
          walletId,
          title: dto.title,
          amount: dto.amount,
          date: new Date(dto.date),
          paidById,
          createdById: userId,
        },
        select: expenseSelect,
      });

      // chaque action sur un porte-monnaie rafraîchit updatedAt.
      await transaction.wallet.update({
        where: { id: walletId },
        data: { updatedAt: new Date() },
      });

      return createdExpense;
    });

    return toExpenseItem(expense);
  }

  private async findWalletOfMember(walletId: string, userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { status: true },
    });

    if (!wallet) {
      throw new NotFoundException('Porte-monnaie introuvable.');
    }

    if (!(await this.isMember(walletId, userId))) {
      throw new ForbiddenException('Accès refusé à ce porte-monnaie.');
    }

    return wallet;
  }

  private async isMember(walletId: string, userId: string) {
    const membership = await this.prisma.walletMember.findUnique({
      where: { walletId_userId: { walletId, userId } },
      select: { status: true },
    });

    return membership?.status === 'MEMBER';
  }
}
