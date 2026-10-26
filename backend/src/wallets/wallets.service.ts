import { Injectable } from '@nestjs/common';
import { Prisma, type WalletStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateWalletDto } from './dto/create-wallet.dto.js';
import type { ListWalletsQueryDto } from './dto/list-wallets-query.dto.js';
import {
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  encodeCursor,
  toPage,
  type DecodedCursor,
} from './wallet-pagination.js';

const walletSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
} satisfies Prisma.WalletSelect;

// Seules les informations utiles à l'interface sont exposées : ni créateur, ni autres membres.
const walletListSelect = {
  ...walletSelect,
  closedAt: true,
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

  async listForUser(userId: string, query: ListWalletsQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    // Les curseurs sont décodés avant toute requête : un curseur invalide répond 400 sans accès à la base.
    const openCursor = this.decodeOptionalCursor(query.openCursor);
    const closedCursor = this.decodeOptionalCursor(query.closedCursor);
    const invitationsCursor = this.decodeOptionalCursor(
      query.invitationsCursor,
    );

    const [open, closed, invitations] = await Promise.all([
      this.listMemberWallets(userId, 'OPEN', limit, openCursor),
      this.listMemberWallets(userId, 'CLOSED', limit, closedCursor),
      this.listInvitations(userId, limit, invitationsCursor),
    ]);

    return { open, closed, invitations };
  }

  private decodeOptionalCursor(cursor: string | undefined) {
    return cursor === undefined ? undefined : decodeCursor(cursor);
  }

  // Porte-monnaies dont l'utilisateur est membre, triés par Wallet.createdAt décroissant puis par identifiant.
  private async listMemberWallets(
    userId: string,
    status: WalletStatus,
    limit: number,
    cursor: DecodedCursor | undefined,
  ) {
    const wallets = await this.prisma.wallet.findMany({
      where: {
        status,
        members: { some: { userId, status: 'MEMBER' } },
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.date } },
            { createdAt: cursor.date, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: walletListSelect,
    });

    return toPage(
      wallets,
      limit,
      (wallet) => wallet,
      (wallet) => encodeCursor(wallet.createdAt, wallet.id),
    );
  }

  // Invitations en attente vers un porte-monnaie ouvert, triées par WalletMember.invitedAt décroissant puis par identifiant d'adhésion.
  private async listInvitations(
    userId: string,
    limit: number,
    cursor: DecodedCursor | undefined,
  ) {
    const memberships = await this.prisma.walletMember.findMany({
      where: {
        userId,
        status: 'INVITED',
        wallet: { status: 'OPEN' },
        ...(cursor && {
          OR: [
            { invitedAt: { lt: cursor.date } },
            { invitedAt: cursor.date, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        invitedAt: true,
        wallet: { select: walletListSelect },
      },
    });

    return toPage(
      memberships,
      limit,
      ({ invitedAt, wallet }) => ({ ...wallet, invitedAt }),
      (membership) => encodeCursor(membership.invitedAt, membership.id),
    );
  }
}
