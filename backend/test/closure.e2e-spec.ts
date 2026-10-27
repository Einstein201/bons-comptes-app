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

describe('Wallet closure and balance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `closure-${randomUUID()}`;

  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;
  let frank: TestUser;

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

  // Alice crée le porte-monnaie ; Bob et Frank sont membres, Carol est invitée.
  async function createWalletWithMembers() {
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
          userId: frank.id,
          status: 'MEMBER',
          acceptedAt: new Date(),
        },
        { walletId, userId: carol.id, status: 'INVITED' },
      ],
    });

    return walletId;
  }

  async function createExpense(
    walletId: string,
    amount: number,
    payer: TestUser,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Courses',
        amount,
        date: '2026-10-25',
        paidById: payer.id,
      })
      .expect(201);

    return response.body.id as string;
  }

  function closeWallet(walletId: string, user: TestUser) {
    return request(app.getHttpServer())
      .post(`/wallets/${walletId}/close`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  function getBalance(walletId: string, user: TestUser) {
    return request(app.getHttpServer())
      .get(`/wallets/${walletId}/balance`)
      .set('Authorization', `Bearer ${user.token}`);
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
    frank = await createUserAndLogin('Frank');
  });

  describe('POST /wallets/:id/close', () => {
    it('rejects a request without token with HTTP 401', async () => {
      const walletId = await createWalletWithMembers();

      await request(app.getHttpServer())
        .post(`/wallets/${walletId}/close`)
        .expect(401);
    });

    it('returns 404 when the wallet does not exist', async () => {
      await closeWallet(randomUUID(), alice).expect(404);
    });

    it('returns 403 to a member who is not the creator', async () => {
      const walletId = await createWalletWithMembers();

      await closeWallet(walletId, bob).expect(403);

      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: walletId },
      });
      expect(wallet.status).toBe('OPEN');
    });

    it('closes the wallet, keeps the members and deletes the invitations', async () => {
      const walletId = await createWalletWithMembers();

      const response = await closeWallet(walletId, alice).expect(200);

      expect(response.body).toEqual({
        id: walletId,
        title: 'Vacances',
        description: null,
        status: 'CLOSED',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        closedAt: expect.any(String),
      });

      const memberships = await prisma.walletMember.findMany({
        where: { walletId },
      });
      expect(memberships.map((membership) => membership.status)).toEqual([
        'MEMBER',
        'MEMBER',
        'MEMBER',
      ]);
      expect(
        memberships.some((membership) => membership.userId === carol.id),
      ).toBe(false);
    });

    it('returns 409 when the wallet is already closed', async () => {
      const walletId = await createWalletWithMembers();
      await closeWallet(walletId, alice).expect(200);

      await closeWallet(walletId, alice).expect(409);
    });

    it('refuses to add or delete an expense after the closure', async () => {
      const walletId = await createWalletWithMembers();
      const expenseId = await createExpense(walletId, 1000, alice);
      await closeWallet(walletId, alice).expect(200);

      await request(app.getHttpServer())
        .post(`/wallets/${walletId}/expenses`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ title: 'Trop tard', amount: 500, date: '2026-10-26' })
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/wallets/${walletId}/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(409);

      expect(await prisma.expense.count({ where: { walletId } })).toBe(1);
    });
  });

  describe('GET /wallets/:id/balance', () => {
    let walletId: string;

    beforeAll(async () => {
      // Total 12001 centimes pour 3 membres : 4000 chacun, plus 1 centime pour le premier id.
      walletId = await createWalletWithMembers();
      await createExpense(walletId, 10000, alice);
      await createExpense(walletId, 2001, bob);

      await prisma.repayment.createMany({
        data: [
          {
            walletId,
            fromUserId: frank.id,
            toUserId: alice.id,
            amount: 1000,
            status: 'PAID',
            paidAt: new Date(),
          },
          {
            walletId,
            fromUserId: frank.id,
            toUserId: alice.id,
            amount: 500,
            status: 'PENDING',
          },
          {
            walletId,
            fromUserId: bob.id,
            toUserId: alice.id,
            amount: 700,
            status: 'CANCELLED',
          },
        ],
      });

      await closeWallet(walletId, alice).expect(200);
    });

    it('rejects a request without token with HTTP 401', async () => {
      await request(app.getHttpServer())
        .get(`/wallets/${walletId}/balance`)
        .expect(401);
    });

    it('returns 404 when the wallet does not exist', async () => {
      await getBalance(randomUUID(), alice).expect(404);
    });

    it('returns 403 to a user who is not a member', async () => {
      await getBalance(walletId, dave).expect(403);
    });

    it('returns 403 to a user whose invitation was deleted by the closure', async () => {
      await getBalance(walletId, carol).expect(403);
    });

    it('returns 409 when the wallet is still open', async () => {
      const openWalletId = await createWalletWithMembers();

      await getBalance(openWalletId, alice).expect(409);
    });

    it('computes the shares, the remainder and the paid repayments', async () => {
      const response = await getBalance(walletId, frank).expect(200);

      const sortedIds = [alice.id, bob.id, frank.id].sort();
      const shareOf = (userId: string) =>
        sortedIds.indexOf(userId) === 0 ? 4001 : 4000;

      expect(response.body.walletId).toBe(walletId);
      expect(response.body.totalAmount).toBe(12001);
      expect(
        response.body.balances.map((item: { userId: string }) => item.userId),
      ).toEqual(sortedIds);

      const byUser = (userId: string) =>
        response.body.balances.find(
          (item: { userId: string }) => item.userId === userId,
        );

      // Seul le remboursement PAID de Frank à Alice (1000) est pris en compte.
      expect(byUser(alice.id)).toEqual({
        userId: alice.id,
        name: 'Alice',
        paidAmount: 10000,
        shareAmount: shareOf(alice.id),
        balance: 10000 - shareOf(alice.id) - 1000,
      });
      expect(byUser(bob.id)).toEqual({
        userId: bob.id,
        name: 'Bob',
        paidAmount: 2001,
        shareAmount: shareOf(bob.id),
        balance: 2001 - shareOf(bob.id),
      });
      expect(byUser(frank.id)).toEqual({
        userId: frank.id,
        name: 'Frank',
        paidAmount: 0,
        shareAmount: shareOf(frank.id),
        balance: -shareOf(frank.id) + 1000,
      });
    });

    it('produces balances whose sum is zero and transfers that settle them', async () => {
      const { body } = await getBalance(walletId, alice).expect(200);

      const balances: { userId: string; balance: number }[] = body.balances;
      const transfers: {
        fromUserId: string;
        toUserId: string;
        amount: number;
      }[] = body.transfers;

      expect(balances.reduce((sum, item) => sum + item.balance, 0)).toBe(0);

      for (const item of balances) {
        const received = transfers
          .filter((transfer) => transfer.toUserId === item.userId)
          .reduce((sum, transfer) => sum + transfer.amount, 0);
        const sent = transfers
          .filter((transfer) => transfer.fromUserId === item.userId)
          .reduce((sum, transfer) => sum + transfer.amount, 0);

        expect(received - sent).toBe(item.balance);
      }
      for (const transfer of transfers) {
        expect(Number.isInteger(transfer.amount)).toBe(true);
        expect(transfer.amount).toBeGreaterThan(0);
      }
    });

    it('returns the same transfers on every call', async () => {
      const first = await getBalance(walletId, alice).expect(200);
      const second = await getBalance(walletId, bob).expect(200);

      expect(second.body.transfers).toEqual(first.body.transfers);
    });

    it('never returns sensitive data', async () => {
      const { body } = await getBalance(walletId, alice).expect(200);

      expect(JSON.stringify(body)).not.toMatch(/password|email/i);
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
