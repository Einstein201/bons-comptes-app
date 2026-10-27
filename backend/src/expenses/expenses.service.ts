import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor } from '../wallets/wallet-pagination.js';
import type { CreateExpenseDto } from './dto/create-expense.dto.js';
import type { ListExpensesQueryDto } from './dto/list-expenses-query.dto.js';

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

  async findAll(walletId: string, userId: string, query: ListExpensesQueryDto) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    await this.findWalletOfMember(walletId, userId);

    const afterCursor = cursor
      ? {
          OR: [
            { date: { lt: cursor.date } },
            { date: cursor.date, id: { lt: cursor.id } },
          ],
        }
      : {};

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where: { walletId, ...afterCursor },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: expenseSelect,
      }),
      this.prisma.expense.aggregate({
        where: { walletId },
        _sum: { amount: true },
      }),
    ]);

    const hasNextPage = expenses.length > query.limit;
    const page = expenses.slice(0, query.limit);
    const lastExpense = page[page.length - 1];

    return {
      items: page.map(toExpenseItem),
      nextCursor: hasNextPage
        ? encodeCursor(lastExpense.date, lastExpense.id)
        : null,
      totalAmount: total._sum.amount ?? 0,
    };
  }

  async remove(walletId: string, expenseId: string, userId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const expense = await transaction.expense.findFirst({
        where: { id: expenseId, walletId },
        select: {
          paidById: true,
          wallet: { select: { status: true } },
        },
      });

      if (!expense) {
        throw new NotFoundException('Dépense introuvable.');
      }

      if (expense.wallet.status !== 'OPEN') {
        throw new ConflictException('Ce porte-monnaie est fermé.');
      }

      if (expense.paidById !== userId) {
        throw new ForbiddenException(
          'Seul le payeur peut supprimer cette dépense.',
        );
      }

      await transaction.expense.delete({ where: { id: expenseId } });

      await transaction.wallet.update({
        where: { id: walletId },
        data: { updatedAt: new Date() },
      });
    });
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
