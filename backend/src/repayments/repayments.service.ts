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
import type { CreateRepaymentDto } from './dto/create-repayment.dto.js';

const repaymentSelect = {
  id: true,
  fromUserId: true,
  toUserId: true,
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
