import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

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
