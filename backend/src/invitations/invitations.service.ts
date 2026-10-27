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

  async create(
    walletId: string,
    dto: CreateInvitationDto,
    creatorId: string,
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { createdById: true, status: true },
    });

    if (!wallet) {
      throw new NotFoundException('Porte-monnaie introuvable.');
    }
    if (wallet.createdById !== creatorId) {
      throw new ForbiddenException('Seul le créateur peut inviter un utilisateur.');
    }
    if (wallet.status !== 'OPEN') {
      throw new ConflictException('Ce porte-monnaie est fermé.');
    }

    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (!invitee) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    if (invitee.id === creatorId) {
      throw new BadRequestException('Vous ne pouvez pas vous inviter vous-même.');
    }

    const existingMembership = await this.prisma.walletMember.findUnique({
      where: { walletId_userId: { walletId, userId: invitee.id } },
      select: { id: true },
    });
    if (existingMembership) {
      throw new ConflictException('Cet utilisateur est déjà invité ou membre.');
    }

    try {
      return await this.prisma.walletMember.create({
        data: {
          walletId,
          userId: invitee.id,
          status: 'INVITED',
        },
        select: invitationSelect,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Cet utilisateur est déjà invité ou membre.');
      }
      throw error;
    }
  }

  async list(userId: string, query: ListInvitationsQueryDto) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const where: Prisma.WalletMemberWhereInput = {
      userId,
      status: 'INVITED',
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
    const invitation = await this.prisma.walletMember.findUnique({
      where: { id: invitationId },
      select: { userId: true, status: true, wallet: { select: { status: true } } },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation introuvable.');
    }
    if (invitation.userId !== inviteeId) {
      throw new ForbiddenException('Cette invitation appartient à un autre utilisateur.');
    }
    if (invitation.status !== 'INVITED') {
      throw new ConflictException('Cette invitation a déjà été traitée.');
    }
    if (invitation.wallet.status !== 'OPEN') {
      throw new ConflictException('Ce porte-monnaie est fermé.');
    }

    const result = await this.prisma.walletMember.updateMany({
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
      throw new ConflictException('Cette invitation a déjà été traitée ou le porte-monnaie est fermé.');
    }

    return { id: invitationId, status: 'MEMBER' as const };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
