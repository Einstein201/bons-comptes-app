import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculateBalances } from '../closure/balance-calculator.js';
import { loadBalanceData } from '../closure/balance-data.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor } from '../wallets/wallet-pagination.js';
import type { CreateRepaymentDto } from './dto/create-repayment.dto.js';
import type { ListRepaymentsQueryDto } from './dto/list-repayments-query.dto.js';

const repaymentSelect = {
  id: true,
  fromUserId: true,
  toUserId: true,
  amount: true,
  status: true,
  createdAt: true,
  paidAt: true,
} satisfies Prisma.RepaymentSelect;

// Seuls l'id et le nom des membres sont exposés : jamais leur email.
const repaymentListSelect = {
  id: true,
  fromUser: { select: { id: true, name: true } },
  toUser: { select: { id: true, name: true } },
  amount: true,
  status: true,
  createdAt: true,
  paidAt: true,
} satisfies Prisma.RepaymentSelect;

@Injectable()
export class RepaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async declare(walletId: string, userId: string, dto: CreateRepaymentDto) {
    if (dto.toUserId === userId) {
      throw new BadRequestException('Impossible de se rembourser soi-même.');
    }

    return this.prisma.$transaction(async (transaction) => {
      // Verrou sur le porte-monnaie : deux déclarations simultanées passent l'une après l'autre.
      const lockedWallets = await transaction.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "Wallet" WHERE "id" = ${walletId} FOR UPDATE`;
      const wallet = lockedWallets[0];

      if (!wallet) {
        throw new NotFoundException('Porte-monnaie introuvable.');
      }

      if (!(await this.isMember(transaction, walletId, userId))) {
        throw new ForbiddenException('Accès refusé à ce porte-monnaie.');
      }

      if (wallet.status !== 'CLOSED') {
        throw new ConflictException('Ce porte-monnaie n’est pas clôturé.');
      }

      if (!(await this.isMember(transaction, walletId, dto.toUserId))) {
        throw new BadRequestException(
          'Le destinataire doit être un membre du porte-monnaie.',
        );
      }

      const remainingDebt = await this.remainingDebt(
        transaction,
        walletId,
        userId,
        dto.toUserId,
      );

      if (dto.amount > remainingDebt) {
        throw new ConflictException(
          'Le montant dépasse la dette restante envers ce membre.',
        );
      }

      const repayment = await transaction.repayment.create({
        data: {
          walletId,
          fromUserId: userId,
          toUserId: dto.toUserId,
          amount: dto.amount,
          status: 'PENDING',
        },
        select: repaymentSelect,
      });

      await transaction.wallet.update({
        where: { id: walletId },
        data: { updatedAt: new Date() },
      });

      return repayment;
    });
  }

  async findAll(
    walletId: string,
    userId: string,
    query: ListRepaymentsQueryDto,
  ) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { createdById: true },
    });

    if (!wallet) {
      throw new NotFoundException('Porte-monnaie introuvable.');
    }

    if (!(await this.isMember(this.prisma, walletId, userId))) {
      throw new ForbiddenException('Accès refusé à ce porte-monnaie.');
    }

    // Le curseur contient createdAt et id de la dernière ligne : la page suivante
    // reprend juste après, dans le même ordre (createdAt puis id décroissants).
    const afterCursor = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.date } },
            { createdAt: cursor.date, id: { lt: cursor.id } },
          ],
        }
      : {};

    const repayments = await this.prisma.repayment.findMany({
      where: { walletId, status: query.status, ...afterCursor },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: repaymentListSelect,
    });

    const hasNextPage = repayments.length > query.limit;
    const page = repayments.slice(0, query.limit);
    const lastRepayment = page[page.length - 1];

    // Simples indications pour l'affichage : confirm et cancel revérifient
    // les droits et le statut au moment de l'action.
    const items = page.map((repayment) => {
      const isPending = repayment.status === 'PENDING';

      return {
        ...repayment,
        canConfirm:
          isPending &&
          (userId === repayment.toUser.id || userId === wallet.createdById),
        canCancel: isPending && userId === repayment.fromUser.id,
      };
    });

    return {
      items,
      nextCursor: hasNextPage
        ? encodeCursor(lastRepayment.createdAt, lastRepayment.id)
        : null,
    };
  }

  async confirm(walletId: string, repaymentId: string, userId: string) {
    const repayment = await this.findRepayment(walletId, repaymentId);

    if (
      userId !== repayment.toUserId &&
      userId !== repayment.wallet.createdById
    ) {
      throw new ForbiddenException(
        'Seul le destinataire ou le créateur du porte-monnaie peut confirmer ce remboursement.',
      );
    }

    return this.changePendingStatus(walletId, repaymentId, {
      status: 'PAID',
      paidAt: new Date(),
    });
  }

  async cancel(walletId: string, repaymentId: string, userId: string) {
    const repayment = await this.findRepayment(walletId, repaymentId);

    if (userId !== repayment.fromUserId) {
      throw new ForbiddenException(
        'Seul l’émetteur peut annuler ce remboursement.',
      );
    }

    return this.changePendingStatus(walletId, repaymentId, {
      status: 'CANCELLED',
    });
  }

  // Option A validée par la PO : dette de départ calculée sans remboursements,
  // moins les remboursements PENDING et PAID déjà déclarés pour la même paire.
  private async remainingDebt(
    transaction: Prisma.TransactionClient,
    walletId: string,
    fromUserId: string,
    toUserId: string,
  ) {
    const { totalAmount, memberPayments } = await loadBalanceData(
      transaction,
      walletId,
    );
    const { transfers } = calculateBalances(totalAmount, memberPayments, []);
    const initialDebt =
      transfers.find(
        (transfer) =>
          transfer.fromUserId === fromUserId && transfer.toUserId === toUserId,
      )?.amount ?? 0;

    const declared = await transaction.repayment.aggregate({
      where: {
        walletId,
        fromUserId,
        toUserId,
        status: { in: ['PENDING', 'PAID'] },
      },
      _sum: { amount: true },
    });

    return initialDebt - (declared._sum.amount ?? 0);
  }

  private async isMember(
    transaction: Prisma.TransactionClient,
    walletId: string,
    userId: string,
  ) {
    const membership = await transaction.walletMember.findUnique({
      where: { walletId_userId: { walletId, userId } },
      select: { status: true },
    });

    return membership?.status === 'MEMBER';
  }

  private async findRepayment(walletId: string, repaymentId: string) {
    const repayment = await this.prisma.repayment.findFirst({
      where: { id: repaymentId, walletId },
      select: {
        fromUserId: true,
        toUserId: true,
        wallet: { select: { createdById: true, status: true } },
      },
    });

    if (!repayment) {
      throw new NotFoundException('Remboursement introuvable.');
    }

    if (repayment.wallet.status !== 'CLOSED') {
      throw new ConflictException('Ce porte-monnaie n’est pas clôturé.');
    }

    return repayment;
  }

  private async changePendingStatus(
    walletId: string,
    repaymentId: string,
    data: Prisma.RepaymentUpdateManyMutationInput,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      // La condition status: 'PENDING' empêche de traiter deux fois le même remboursement.
      const { count } = await transaction.repayment.updateMany({
        where: { id: repaymentId, status: 'PENDING' },
        data,
      });

      if (count === 0) {
        throw new ConflictException('Ce remboursement a déjà été traité.');
      }

      await transaction.wallet.update({
        where: { id: walletId },
        data: { updatedAt: new Date() },
      });

      return transaction.repayment.findUniqueOrThrow({
        where: { id: repaymentId },
        select: repaymentSelect,
      });
    });
  }
}
