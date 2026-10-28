import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async leave(walletId: string, userId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const wallet = await this.lockWallet(transaction, walletId);

      if (!(await this.isMember(transaction, walletId, userId))) {
        throw new ForbiddenException('Accès refusé à ce porte-monnaie.');
      }

      if (wallet.createdById === userId) {
        throw new ForbiddenException(
          'Le créateur ne peut pas quitter son porte-monnaie.',
        );
      }

      if (wallet.status !== 'OPEN') {
        throw new ConflictException('Ce porte-monnaie est fermé.');
      }

      await this.deleteMembership(transaction, walletId, userId);
    });
  }

  async remove(walletId: string, memberId: string, userId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const wallet = await this.lockWallet(transaction, walletId);

      if (wallet.createdById !== userId) {
        throw new ForbiddenException(
          'Seul le créateur peut retirer un membre.',
        );
      }

      if (memberId === userId) {
        throw new ForbiddenException(
          'Le créateur ne peut pas se retirer lui-même.',
        );
      }

      if (wallet.status !== 'OPEN') {
        throw new ConflictException('Ce porte-monnaie est fermé.');
      }

      if (!(await this.isMember(transaction, walletId, memberId))) {
        throw new NotFoundException('Membre introuvable.');
      }

      await this.deleteMembership(transaction, walletId, memberId);
    });
  }

  // Verrou : aucune dépense ne peut être créée pendant le départ d'un membre.
  private async lockWallet(
    transaction: Prisma.TransactionClient,
    walletId: string,
  ) {
    const lockedWallets = await transaction.$queryRaw<
      { status: string; createdById: string }[]
    >`
      SELECT "status", "createdById" FROM "Wallet"
      WHERE "id" = ${walletId} FOR UPDATE`;
    const wallet = lockedWallets[0];

    if (!wallet) {
      throw new NotFoundException('Porte-monnaie introuvable.');
    }

    return wallet;
  }

  private async deleteMembership(
    transaction: Prisma.TransactionClient,
    walletId: string,
    userId: string,
  ) {
    if (await this.hasSharedHistory(transaction, walletId, userId)) {
      throw new ConflictException(
        'Ce porte-monnaie contient des dépenses partagées. Le départ ou le retrait modifierait leur répartition.',
      );
    }

    await transaction.walletMember.delete({
      where: { walletId_userId: { walletId, userId } },
    });

    await transaction.wallet.update({
      where: { id: walletId },
      data: { updatedAt: new Date() },
    });
  }

  // Toute dépense du porte-monnaie est partagée entre tous les membres (bilan IF-19) :
  // un départ changerait la part des autres, même pour un membre qui n'a rien payé.
  private async hasSharedHistory(
    transaction: Prisma.TransactionClient,
    walletId: string,
    userId: string,
  ) {
    const [expenses, splits, repayments] = await Promise.all([
      transaction.expense.count({ where: { walletId } }),
      transaction.expenseSplit.count({
        where: { userId, expense: { walletId } },
      }),
      transaction.repayment.count({
        where: {
          walletId,
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
      }),
    ]);

    return expenses + splits + repayments > 0;
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
}
