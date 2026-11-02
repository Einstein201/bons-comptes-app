import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor } from '../wallets/wallet-pagination.js';
import type { CreateExpenseDto } from './dto/create-expense.dto.js';
import type { ListExpensesQueryDto } from './dto/list-expenses-query.dto.js';
import type { UpdateExpenseDto } from './dto/update-expense.dto.js';

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
    const expense = await this.prisma.$transaction(async (transaction) => {
      // Verrou sur le porte-monnaie : un membre ne peut pas le quitter pendant la création (IF-28).
      const lockedWallets = await transaction.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "Wallet" WHERE "id" = ${walletId} FOR UPDATE`;
      const wallet = lockedWallets[0];

      if (!wallet) {
        throw new NotFoundException('Porte-monnaie introuvable.');
      }

      if (!(await this.isMember(transaction, walletId, userId))) {
        throw new ForbiddenException('Accès refusé à ce porte-monnaie.');
      }

      if (wallet.status !== 'OPEN') {
        throw new ConflictException('Ce porte-monnaie est fermé.');
      }

      const paidById = dto.paidById ?? userId;

      if (
        paidById !== userId &&
        !(await this.isMember(transaction, walletId, paidById))
      ) {
        throw new ForbiddenException(
          'Le payeur doit être un membre du porte-monnaie.',
        );
      }

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
      const lockedWallets = await transaction.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "Wallet" WHERE "id" = ${walletId} FOR UPDATE`;
      const wallet = lockedWallets[0];

      if (!wallet) {
        throw new NotFoundException('Porte-monnaie introuvable.');
      }

      const expense = await transaction.expense.findFirst({
        where: { id: expenseId, walletId },
        select: { paidById: true },
      });

      if (!expense) {
        throw new NotFoundException('Dépense introuvable.');
      }

      if (wallet.status !== 'OPEN') {
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

  async update(
    walletId: string,
    expenseId: string,
    userId: string,
    dto: UpdateExpenseDto,
  ) {
    if (
      dto.title === undefined &&
      dto.amount === undefined
    ) {
      throw new BadRequestException(
        'Au moins un champ modifiable doit être fourni.',
      );
    }

    const expense = await this.prisma.$transaction(async (transaction) => {
      const lockedWallets = await transaction.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "Wallet" WHERE "id" = ${walletId} FOR UPDATE`;
      const wallet = lockedWallets[0];

      if (!wallet) {
        throw new NotFoundException('Porte-monnaie introuvable.');
      }

      const existing = await transaction.expense.findFirst({
        where: { id: expenseId, walletId },
        select: {
          paidById: true,
          amount: true,
          _count: { select: { splits: true } },
        },
      });

      if (!existing) {
        throw new NotFoundException('Dépense introuvable.');
      }

      if (wallet.status !== 'OPEN') {
        throw new ConflictException('Ce porte-monnaie est fermé.');
      }

      if (existing.paidById !== userId) {
        throw new ForbiddenException(
          'Seul le payeur peut modifier cette dépense.',
        );
      }

      if (
        dto.amount !== undefined &&
        dto.amount !== existing.amount &&
        existing._count.splits > 0
      ) {
        throw new ConflictException(
          'Le montant ne peut pas être modifié car la dépense possède déjà une répartition.',
        );
      }

      const data = {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
      };
      const updatedExpense = await transaction.expense.update({
        where: { id: expenseId },
        data,
        select: expenseSelect,
      });

      await transaction.wallet.update({
        where: { id: walletId },
        data: { updatedAt: new Date() },
      });

      return updatedExpense;
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

    if (!(await this.isMember(this.prisma, walletId, userId))) {
      throw new ForbiddenException('Accès refusé à ce porte-monnaie.');
    }

    return wallet;
  }

  private async isMember(
    client: Prisma.TransactionClient,
    walletId: string,
    userId: string,
  ) {
    const membership = await client.walletMember.findUnique({
      where: { walletId_userId: { walletId, userId } },
      select: { status: true },
    });

    return membership?.status === 'MEMBER';
  }
}
