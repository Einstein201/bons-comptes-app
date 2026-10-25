import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateWalletDto } from './dto/create-wallet.dto.js';

const walletSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
} satisfies Prisma.WalletSelect;

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createWalletDto: CreateWalletDto, creatorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const wallet = await transaction.wallet.create({
        data: {
          title: createWalletDto.title,
          description: createWalletDto.description,
          status: 'OPEN',
          createdById: creatorId,
        },
        select: walletSelect,
      });

      await transaction.walletMember.create({
        data: {
          walletId: wallet.id,
          userId: creatorId,
          status: 'MEMBER',

          acceptedAt: new Date(),
        },
      });

      return wallet;
    });
  }
}
