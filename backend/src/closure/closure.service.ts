import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const closedWalletSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
} satisfies Prisma.WalletSelect;

@Injectable()
export class ClosureService {
  constructor(private readonly prisma: PrismaService) {}

  async close(walletId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const wallet = await transaction.wallet.findUnique({
        where: { id: walletId },
        select: { createdById: true, status: true },
      });

      if (!wallet) {
        throw new NotFoundException('Porte-monnaie introuvable.');
      }

      if (wallet.createdById !== userId) {
        throw new ForbiddenException(
          'Seul le créateur peut clôturer ce porte-monnaie.',
        );
      }

      // La condition status: 'OPEN' empêche deux clôtures simultanées.
      const { count } = await transaction.wallet.updateMany({
        where: { id: walletId, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      if (count === 0) {
        throw new ConflictException('Ce porte-monnaie est déjà fermé.');
      }

      await transaction.walletMember.deleteMany({
        where: { walletId, status: 'INVITED' },
      });

      return transaction.wallet.findUniqueOrThrow({
        where: { id: walletId },
        select: closedWalletSelect,
      });
    });
  }
}
