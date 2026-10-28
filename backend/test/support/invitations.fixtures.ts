import { randomUUID } from 'node:crypto';
import type { Prisma, WalletStatus } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

export function getInvitationTestDatabaseUrl(): string {
  const value = process.env.IF13_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      'IF13_TEST_DATABASE_URL est obligatoire : utiliser une base PostgreSQL locale dédiée (nom préfixé par if13_test).',
    );
  }

  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/if13_test[a-zA-Z0-9_]*$/.test(url.pathname)
  ) {
    throw new Error(
      'Les tests IF-13 exigent une base PostgreSQL locale dont le nom commence par if13_test.',
    );
  }

  return value;
}

// Aucun appel aux routes d'inscription, de création ou de clôture de portefeuille.
export function createInvitationFixtures(prisma: PrismaService) {
  const userIds: string[] = [];
  const walletIds: string[] = [];
  const emailPrefix = `if13-${randomUUID()}`;

  async function createUser(name: string, passwordHash: string) {
    const user = await prisma.user.create({
      data: {
        email: `${emailPrefix}-${userIds.length}@example.com`,
        name,
        password: passwordHash,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createWallet(
    creatorId: string,
    status: WalletStatus = 'OPEN',
  ) {
    const wallet = await prisma.wallet.create({
      data: {
        title: 'Week-end à Lille',
        description: 'Dépenses communes du voyage',
        createdById: creatorId,
        status,
        closedAt: status === 'CLOSED' ? new Date() : null,
        members: {
          create: {
            userId: creatorId,
            status: 'MEMBER',
            acceptedAt: new Date(),
          },
        },
      },
    });
    walletIds.push(wallet.id);
    return wallet;
  }

  function createMembership(
    walletId: string,
    userId: string,
    options: Pick<
      Prisma.WalletMemberUncheckedCreateInput,
      'status' | 'invitedAt' | 'acceptedAt'
    > = {},
  ) {
    return prisma.walletMember.create({
      data: { walletId, userId, ...options },
    });
  }

  async function createInvitations(
    creatorId: string,
    userId: string,
    count: number,
    sameDate = false,
  ) {
    const wallets = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      title: `Voyage ${index}`,
      description: `Invitation ${index}`,
      createdById: creatorId,
    }));
    await prisma.wallet.createMany({ data: wallets });
    walletIds.push(...wallets.map((wallet) => wallet.id));

    const memberships = wallets.map((wallet, index) => ({
      id: randomUUID(),
      walletId: wallet.id,
      userId,
      status: 'INVITED' as const,
      invitedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, sameDate ? 0 : index)),
    }));
    await prisma.walletMember.createMany({
      data: [
        ...wallets.map((wallet) => ({
          walletId: wallet.id,
          userId: creatorId,
          status: 'MEMBER' as const,
          acceptedAt: new Date(),
        })),
        ...memberships,
      ],
    });

    // Comparaison lexicale d'UUID ASCII, identique au tri PostgreSQL de ces ids.
    return memberships.sort(
      (left, right) =>
        right.invitedAt.getTime() - left.invitedAt.getTime() ||
        (left.id < right.id ? 1 : left.id > right.id ? -1 : 0),
    );
  }

  async function cleanup() {
    // Suppression limitée aux identifiants créés par ce test, même après échec.
    await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  return {
    createUser,
    createWallet,
    createMembership,
    createInvitations,
    cleanup,
  };
}
