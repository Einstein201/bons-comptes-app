import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface TestUser {
  id: string;
  token: string;
}

describe('Leaving and removing members (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `memberships-${randomUUID()}`;

  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;
  let erin: TestUser;

  async function createUserAndLogin(name: string): Promise<TestUser> {
    const credentials = {
      email: `${emailPrefix}-${name.toLowerCase()}@example.com`,
      password: 'motdepasse123',
    };

    const registration = await request(app.getHttpServer())
      .post('/users')
      .send({ ...credentials, name })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    return { id: registration.body.id, token: login.body.accessToken };
  }

  // Alice crée le porte-monnaie ; Bob et Carol sont membres, Erin est invitée, Dave n'a aucun lien.
  async function createWallet() {
    const response = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Vacances' })
      .expect(201);
    const walletId = response.body.id as string;

    await prisma.walletMember.createMany({
      data: [
        { walletId, userId: bob.id, status: 'MEMBER', acceptedAt: new Date() },
        {
          walletId,
          userId: carol.id,
          status: 'MEMBER',
          acceptedAt: new Date(),
        },
        { walletId, userId: erin.id, status: 'INVITED' },
      ],
    });

    return walletId;
  }

  function createExpense(walletId: string, creator: TestUser, payer: TestUser) {
    return request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', `Bearer ${creator.token}`)
      .send({
        title: 'Courses',
        amount: 3000,
        date: '2026-10-25',
        paidById: payer.id,
      });
  }

  async function closeWallet(walletId: string) {
    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/close`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
  }

  function leave(walletId: string, user: TestUser) {
    return request(app.getHttpServer())
      .delete(`/wallets/${walletId}/members/me`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  function removeMember(walletId: string, member: TestUser, user: TestUser) {
    return request(app.getHttpServer())
      .delete(`/wallets/${walletId}/members/${member.id}`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  async function membershipStatus(walletId: string, user: TestUser) {
    const membership = await prisma.walletMember.findUnique({
      where: { walletId_userId: { walletId, userId: user.id } },
    });

    return membership?.status ?? null;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    alice = await createUserAndLogin('Alice');
    bob = await createUserAndLogin('Bob');
    carol = await createUserAndLogin('Carol');
    dave = await createUserAndLogin('Dave');
    erin = await createUserAndLogin('Erin');
  });

  describe('DELETE /wallets/:walletId/members/me', () => {
    it('lets a member without history leave the wallet with HTTP 204', async () => {
      const walletId = await createWallet();

      const response = await leave(walletId, bob).expect(204);

      expect(response.text).toBe('');
      expect(await membershipStatus(walletId, bob)).toBeNull();
      await request(app.getHttpServer())
        .get(`/wallets/${walletId}`)
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(403);
    });

    it('returns 403 when the creator tries to leave', async () => {
      const walletId = await createWallet();

      await leave(walletId, alice).expect(403);

      expect(await membershipStatus(walletId, alice)).toBe('MEMBER');
    });

    it.each([
      ['a user who is not a member', () => dave],
      ['a user who is only invited', () => erin],
    ])('returns 403 to %s', async (_case, getUser) => {
      const walletId = await createWallet();

      await leave(walletId, getUser()).expect(403);
    });

    it('returns 404 when the wallet does not exist', async () => {
      await leave(randomUUID(), bob).expect(404);
    });

    it('returns 409 when the wallet is closed', async () => {
      const walletId = await createWallet();
      await closeWallet(walletId);

      await leave(walletId, bob).expect(409);

      expect(await membershipStatus(walletId, bob)).toBe('MEMBER');
    });

    it('rejects a request without token with HTTP 401', async () => {
      const walletId = await createWallet();

      await request(app.getHttpServer())
        .delete(`/wallets/${walletId}/members/me`)
        .expect(401);
    });
  });

  describe('DELETE /wallets/:walletId/members/:userId', () => {
    it('lets the creator remove a member without history with HTTP 204', async () => {
      const walletId = await createWallet();

      await removeMember(walletId, carol, alice).expect(204);

      expect(await membershipStatus(walletId, carol)).toBeNull();
    });

    it('returns 403 when a member who is not the creator removes someone', async () => {
      const walletId = await createWallet();

      await removeMember(walletId, carol, bob).expect(403);

      expect(await membershipStatus(walletId, carol)).toBe('MEMBER');
    });

    it('returns 403 when the creator tries to remove himself', async () => {
      const walletId = await createWallet();

      await removeMember(walletId, alice, alice).expect(403);
    });

    it('returns 404 for an invited user and keeps the invitation', async () => {
      const walletId = await createWallet();

      await removeMember(walletId, erin, alice).expect(404);

      expect(await membershipStatus(walletId, erin)).toBe('INVITED');
    });

    it('returns 404 for a user who is not in the wallet', async () => {
      const walletId = await createWallet();

      await removeMember(walletId, dave, alice).expect(404);
    });

    it('returns 409 when the wallet is closed', async () => {
      const walletId = await createWallet();
      await closeWallet(walletId);

      await removeMember(walletId, carol, alice).expect(409);
    });

    it('rejects a request without token with HTTP 401', async () => {
      const walletId = await createWallet();

      await request(app.getHttpServer())
        .delete(`/wallets/${walletId}/members/${carol.id}`)
        .expect(401);
    });
  });

  describe('financial history', () => {
    it('keeps a member who paid an expense', async () => {
      const walletId = await createWallet();
      await createExpense(walletId, alice, bob).expect(201);

      await leave(walletId, bob).expect(409);
      await removeMember(walletId, bob, alice).expect(409);

      expect(await membershipStatus(walletId, bob)).toBe('MEMBER');
    });

    it('keeps a member who entered an expense paid by someone else', async () => {
      const walletId = await createWallet();
      await createExpense(walletId, bob, alice).expect(201);

      await leave(walletId, bob).expect(409);
    });

    it('keeps a member who has a share of an expense', async () => {
      const walletId = await createWallet();
      const expense = await createExpense(walletId, alice, alice).expect(201);
      await prisma.expenseSplit.create({
        data: { expenseId: expense.body.id, userId: carol.id, amount: 1000 },
      });

      await removeMember(walletId, carol, alice).expect(409);
    });

    it('keeps a member involved in a repayment', async () => {
      const walletId = await createWallet();
      await prisma.repayment.create({
        data: {
          walletId,
          fromUserId: carol.id,
          toUserId: alice.id,
          amount: 500,
        },
      });

      await leave(walletId, carol).expect(409);
    });

    it('does not delete the history of the others when a member without history leaves', async () => {
      const walletId = await createWallet();
      await createExpense(walletId, alice, alice).expect(201);
      await createExpense(walletId, alice, bob).expect(201);

      await leave(walletId, carol).expect(204);

      expect(await prisma.expense.count({ where: { walletId } })).toBe(2);
      const list = await request(app.getHttpServer())
        .get(`/wallets/${walletId}/expenses`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);
      expect(list.body.totalAmount).toBe(6000);
    });

    it('never accepts both a departure and a new expense of the same member', async () => {
      const walletId = await createWallet();

      const [departure, expense] = await Promise.all([
        leave(walletId, bob),
        createExpense(walletId, alice, bob),
      ]);

      // Selon l'ordre d'arrivée : soit Bob part et la dépense est refusée, soit l'inverse.
      expect([
        [204, 403],
        [409, 201],
      ]).toContainEqual([departure.status, expense.status]);
    });
  });

  afterAll(async () => {
    try {
      // Les dépenses, remboursements et adhésions sont supprimés en cascade avec le porte-monnaie.
      await prisma.wallet.deleteMany({
        where: { createdBy: { email: { startsWith: emailPrefix } } },
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: emailPrefix } },
      });
    } finally {
      await app.close();
    }
  });
});
