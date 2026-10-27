import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor } from '../wallets/wallet-pagination.js';
import type { CreateInvitationDto } from './dto/create-invitation.dto.js';
import type { ListInvitationsQueryDto } from './dto/list-invitations-query.dto.js';

const invitationSelect = {
  id: true,
  invitedAt: true,
  wallet: {
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
    },
  },
} satisfies Prisma.WalletMemberSelect;

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(walletId: string, dto: CreateInvitationDto, creatorId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const wallets = await transaction.$queryRaw<
          { createdById: string; status: 'OPEN' | 'CLOSED' }[]
        >`SELECT "createdById", "status" FROM "Wallet" WHERE "id" = ${walletId} FOR UPDATE`;
        const wallet = wallets[0];

        if (!wallet) {
          throw new NotFoundException('Porte-monnaie introuvable.');
        }
        if (wallet.createdById !== creatorId) {
          throw new ForbiddenException(
            'Seul le créateur peut inviter un utilisateur.',
          );
        }
        if (wallet.status !== 'OPEN') {
          throw new ConflictException('Ce porte-monnaie est fermé.');
        }

        const invitee = await transaction.user.findUnique({
          where: { email: dto.email },
          select: { id: true },
        });
        if (!invitee) {
          throw new NotFoundException('Utilisateur introuvable.');
        }
        if (invitee.id === creatorId) {
          throw new BadRequestException(
            'Vous ne pouvez pas vous inviter vous-même.',
          );
        }

        const existingMembership = await transaction.walletMember.findUnique({
          where: { walletId_userId: { walletId, userId: invitee.id } },
          select: { id: true },
        });
        if (existingMembership) {
          throw new ConflictException(
            'Cet utilisateur est déjà invité ou membre.',
          );
        }

        const invitation = await transaction.walletMember.create({
          data: {
            walletId,
            userId: invitee.id,
            status: 'INVITED',
          },
          select: invitationSelect,
        });

        await transaction.wallet.update({
          where: { id: walletId },
          data: { updatedAt: new Date() },
        });

        return invitation;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Cet utilisateur est déjà invité ou membre.',
        );
      }
      throw error;
    }
  }

  async list(userId: string, query: ListInvitationsQueryDto) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const where: Prisma.WalletMemberWhereInput = {
      userId,
      status: 'INVITED',
      wallet: { status: 'OPEN' },
      ...(cursor && {
        OR: [
          { invitedAt: { lt: cursor.date } },
          { invitedAt: cursor.date, id: { lt: cursor.id } },
        ],
      }),
    };

    const memberships = await this.prisma.walletMember.findMany({
      where,
      orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: invitationSelect,
    });
    const hasNextPage = memberships.length > query.limit;
    const page = hasNextPage ? memberships.slice(0, query.limit) : memberships;

    return {
      data: page,
      nextCursor: hasNextPage
        ? encodeCursor(
            page[page.length - 1].invitedAt,
            page[page.length - 1].id,
          )
        : null,
    };
  }

  async accept(invitationId: string, inviteeId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.walletMember.findUnique({
        where: { id: invitationId },
        select: { walletId: true, userId: true, status: true },
      });

      if (!invitation) {
        throw new NotFoundException('Invitation introuvable.');
      }
      if (invitation.userId !== inviteeId) {
        throw new ForbiddenException(
          'Cette invitation appartient à un autre utilisateur.',
        );
      }

      const wallets = await transaction.$queryRaw<
        { status: 'OPEN' | 'CLOSED' }[]
      >`SELECT "status" FROM "Wallet" WHERE "id" = ${invitation.walletId} FOR UPDATE`;
      const wallet = wallets[0];

      if (!wallet || wallet.status !== 'OPEN') {
        throw new ConflictException('Ce porte-monnaie est fermé.');
      }
      if (invitation.status !== 'INVITED') {
        throw new ConflictException('Cette invitation a déjà été traitée.');
      }

      const result = await transaction.walletMember.updateMany({
        where: {
          id: invitationId,
          userId: inviteeId,
          status: 'INVITED',
          wallet: { status: 'OPEN' },
        },
        data: {
          status: 'MEMBER',
          acceptedAt: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new ConflictException(
          'Cette invitation a déjà été traitée ou le porte-monnaie est fermé.',
        );
      }

      await transaction.wallet.update({
        where: { id: invitation.walletId },
        data: { updatedAt: new Date() },
      });

      return { id: invitationId, status: 'MEMBER' as const };
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
