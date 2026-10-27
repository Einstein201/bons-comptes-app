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

describe('Repayments and optimized payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `repayments-${randomUUID()}`;

  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;

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

  // Alice crée le porte-monnaie, Bob et Carol sont membres, Dave n'a aucun lien.
  // Le payeur règle 90 € pour 3 : les deux autres lui doivent 30 € chacun.
  async function createWallet(payer: TestUser, close = true) {
    const creation = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Vacances' })
      .expect(201);
    const walletId = creation.body.id as string;

    await prisma.walletMember.createMany({
      data: [bob, carol].map((user) => ({
        walletId,
        userId: user.id,
        status: 'MEMBER' as const,
        acceptedAt: new Date(),
      })),
    });

    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Location',
        amount: 9000,
        date: '2026-10-25',
        paidById: payer.id,
      })
      .expect(201);

    if (close) {
      await request(app.getHttpServer())
        .post(`/wallets/${walletId}/close`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);
    }

    return walletId;
  }

  function declare(walletId: string, user: TestUser, body: object) {
    return request(app.getHttpServer())
      .post(`/wallets/${walletId}/repayments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(body);
  }

  function changeStatus(
    walletId: string,
    repaymentId: string,
    action: 'confirm' | 'cancel',
    user: TestUser,
  ) {
    return request(app.getHttpServer())
      .post(`/wallets/${walletId}/repayments/${repaymentId}/${action}`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  function getOptimizedPayments(walletId: string, user: TestUser) {
    return request(app.getHttpServer())
      .get(`/wallets/${walletId}/optimized-payments`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  async function balanceOf(walletId: string, user: TestUser) {
    const response = await request(app.getHttpServer())
      .get(`/wallets/${walletId}/balance`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    return response.body.balances.find(
      (item: { userId: string }) => item.userId === user.id,
    ).balance as number;
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
  });

  describe('GET /wallets/:id/optimized-payments', () => {
    let walletId: string;

    beforeAll(async () => {
      walletId = await createWallet(alice);
    });

    it('proposes at most n - 1 transfers that settle the balances', async () => {
      const response = await getOptimizedPayments(walletId, bob).expect(200);

      expect(response.body.walletId).toBe(walletId);
      expect(response.body.transfers).toHaveLength(2);
      expect(response.body.transfers).toEqual(
        expect.arrayContaining([
          { fromUserId: bob.id, toUserId: alice.id, amount: 3000 },
          { fromUserId: carol.id, toUserId: alice.id, amount: 3000 },
        ]),
      );
    });

    it('rejects a request without token with HTTP 401', async () => {
      await request(app.getHttpServer())
        .get(`/wallets/${walletId}/optimized-payments`)
        .expect(401);
    });

    it('returns 404 when the wallet does not exist', async () => {
      await getOptimizedPayments(randomUUID(), alice).expect(404);
    });

    it('returns 403 to a user who is not a member', async () => {
      await getOptimizedPayments(walletId, dave).expect(403);
    });

    it('returns 409 when the wallet is still open', async () => {
      const openWalletId = await createWallet(alice, false);

      await getOptimizedPayments(openWalletId, alice).expect(409);
    });
  });

  describe('POST /wallets/:walletId/repayments', () => {
    it('creates a pending repayment that does not change the balance yet', async () => {
      const walletId = await createWallet(alice);

      const response = await declare(walletId, bob, {
        toUserId: alice.id,
        amount: 1000,
      }).expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        fromUserId: bob.id,
        toUserId: alice.id,
        amount: 1000,
        status: 'PENDING',
        createdAt: expect.any(String),
        paidAt: null,
      });
      expect(await balanceOf(walletId, bob)).toBe(-3000);
    });

    it('refuses an amount above the remaining debt of the pair', async () => {
      const walletId = await createWallet(alice);
      await declare(walletId, bob, { toUserId: alice.id, amount: 1000 }).expect(
        201,
      );

      await declare(walletId, bob, { toUserId: alice.id, amount: 2001 }).expect(
        409,
      );
      await declare(walletId, bob, { toUserId: alice.id, amount: 2000 }).expect(
        201,
      );
    });

    it('accepts only one of two simultaneous declarations of the whole debt', async () => {
      const walletId = await createWallet(alice);

      const responses = await Promise.all([
        declare(walletId, carol, { toUserId: alice.id, amount: 2000 }),
        declare(walletId, carol, { toUserId: alice.id, amount: 2000 }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const declared = await prisma.repayment.aggregate({
        where: { walletId, fromUserId: carol.id },
        _sum: { amount: true },
      });
      expect(declared._sum.amount).toBe(2000);
    });

    it('returns 409 when the user owes nothing to this member', async () => {
      const walletId = await createWallet(alice);

      await declare(walletId, bob, { toUserId: carol.id, amount: 100 }).expect(
        409,
      );
    });

    it('returns 400 for a repayment to oneself', async () => {
      const walletId = await createWallet(alice);

      await declare(walletId, bob, { toUserId: bob.id, amount: 100 }).expect(
        400,
      );
    });

    it('returns 400 when the recipient is not a member', async () => {
      const walletId = await createWallet(alice);

      await declare(walletId, bob, { toUserId: dave.id, amount: 100 }).expect(
        400,
      );
    });

    it.each([
      ['a decimal amount', { amount: 10.5 }],
      ['a zero amount', { amount: 0 }],
      ['a client-supplied fromUserId', { fromUserId: randomUUID() }],
    ])('returns 400 for %s', async (_case, change) => {
      const walletId = await createWallet(alice);

      await declare(walletId, bob, {
        toUserId: alice.id,
        amount: 100,
        ...change,
      }).expect(400);
    });

    it('returns 403 to a user who is not a member', async () => {
      const walletId = await createWallet(alice);

      await declare(walletId, dave, { toUserId: alice.id, amount: 100 }).expect(
        403,
      );
    });

    it('returns 409 when the wallet is still open', async () => {
      const walletId = await createWallet(alice, false);

      await declare(walletId, bob, { toUserId: alice.id, amount: 100 }).expect(
        409,
      );
    });

    it('rejects a request without token with HTTP 401', async () => {
      const walletId = await createWallet(alice);

      await request(app.getHttpServer())
        .post(`/wallets/${walletId}/repayments`)
        .send({ toUserId: alice.id, amount: 100 })
        .expect(401);
    });
  });

  describe('confirm and cancel', () => {
    it('lets the recipient confirm, which updates the balance and the transfers', async () => {
      const walletId = await createWallet(alice);
      const declaration = await declare(walletId, bob, {
        toUserId: alice.id,
        amount: 1000,
      }).expect(201);
      const repaymentId = declaration.body.id;

      await changeStatus(walletId, repaymentId, 'confirm', bob).expect(403);
      await changeStatus(walletId, repaymentId, 'confirm', dave).expect(403);

      const response = await changeStatus(
        walletId,
        repaymentId,
        'confirm',
        alice,
      ).expect(200);

      expect(response.body.status).toBe('PAID');
      expect(response.body.paidAt).toEqual(expect.any(String));
      expect(await balanceOf(walletId, bob)).toBe(-2000);
      expect(await balanceOf(walletId, alice)).toBe(5000);

      const payments = await getOptimizedPayments(walletId, bob).expect(200);
      expect(payments.body.transfers).toEqual(
        expect.arrayContaining([
          { fromUserId: bob.id, toUserId: alice.id, amount: 2000 },
        ]),
      );
    });

    it('lets the creator confirm a repayment addressed to someone else', async () => {
      // Bob a tout payé : Carol lui doit 30 €. Alice n'est que la créatrice.
      const walletId = await createWallet(bob);
      const declaration = await declare(walletId, carol, {
        toUserId: bob.id,
        amount: 1000,
      }).expect(201);

      await changeStatus(
        walletId,
        declaration.body.id,
        'confirm',
        alice,
      ).expect(200);
    });

    it('refuses to process a repayment twice', async () => {
      const walletId = await createWallet(alice);
      const declaration = await declare(walletId, bob, {
        toUserId: alice.id,
        amount: 1000,
      }).expect(201);
      const repaymentId = declaration.body.id;
      await changeStatus(walletId, repaymentId, 'confirm', alice).expect(200);

      await changeStatus(walletId, repaymentId, 'confirm', alice).expect(409);
      await changeStatus(walletId, repaymentId, 'cancel', bob).expect(409);
    });

    it('lets only the sender cancel, which releases the reserved amount', async () => {
      const walletId = await createWallet(alice);
      const declaration = await declare(walletId, carol, {
        toUserId: alice.id,
        amount: 3000,
      }).expect(201);
      const repaymentId = declaration.body.id;
      await declare(walletId, carol, { toUserId: alice.id, amount: 1 }).expect(
        409,
      );

      await changeStatus(walletId, repaymentId, 'cancel', alice).expect(403);
      await changeStatus(walletId, repaymentId, 'cancel', bob).expect(403);
      const response = await changeStatus(
        walletId,
        repaymentId,
        'cancel',
        carol,
      ).expect(200);

      expect(response.body.status).toBe('CANCELLED');
      expect(await balanceOf(walletId, carol)).toBe(-3000);
      await declare(walletId, carol, {
        toUserId: alice.id,
        amount: 3000,
      }).expect(201);
    });

    it('returns 404 for an unknown repayment or a repayment of another wallet', async () => {
      const walletId = await createWallet(alice);
      const otherWalletId = await createWallet(alice);
      const declaration = await declare(otherWalletId, bob, {
        toUserId: alice.id,
        amount: 1000,
      }).expect(201);

      await changeStatus(walletId, randomUUID(), 'confirm', alice).expect(404);
      await changeStatus(
        walletId,
        declaration.body.id,
        'confirm',
        alice,
      ).expect(404);
    });

    it('rejects a request without token with HTTP 401', async () => {
      await request(app.getHttpServer())
        .post(`/wallets/${randomUUID()}/repayments/${randomUUID()}/confirm`)
        .expect(401);
    });
  });

  afterAll(async () => {
    try {
      // Les remboursements, dépenses et adhésions sont supprimés en cascade avec le porte-monnaie.
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
