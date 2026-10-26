import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateWalletDto } from './dto/create-wallet.dto.js';
import type { GetWalletQueryDto } from './dto/get-wallet-query.dto.js';

const walletSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
} satisfies Prisma.WalletSelect;

const membershipSelect = {
  id: true,
  status: true,
  invitedAt: true,
  acceptedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.WalletMemberSelect;

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

  async findOne(walletId: string, userId: string, query: GetWalletQueryDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: walletSelect,
    });

    if (!wallet) {
      throw new NotFoundException('Porte-monnaie introuvable.');
    }

    const currentMembership = await this.prisma.walletMember.findUnique({
      where: { walletId_userId: { walletId, userId } },
      select: { status: true },
    });

    if (currentMembership?.status !== 'MEMBER') {
      throw new ForbiddenException('Accès refusé à ce porte-monnaie.');
    }

    // On demande un élément de plus pour savoir s'il existe une page suivante.
    const memberships = await this.prisma.walletMember.findMany({
      where: { walletId },
      orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      select: membershipSelect,
    });

    const hasNextPage = memberships.length > query.limit;
    const page = memberships.slice(0, query.limit);
    const nextCursor = hasNextPage ? page[page.length - 1].id : null;

    return {
      wallet,
      members: {
        items: page.map((membership) => ({
          userId: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          status: membership.status,
          invitedAt: membership.invitedAt,
          acceptedAt: membership.acceptedAt,
        })),
        nextCursor,
      },
    };
  }
}
