import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface TestUser {
  id: string;
  email: string;
  token: string;
}

interface NotificationBody {
  id: string;
  type: string;
  message: string;
  walletId: string | null;
  readAt: string | null;
  createdAt: string;
}

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `notifications-${randomUUID()}`;

  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;

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

    return {
      id: registration.body.id,
      email: credentials.email,
      token: login.body.accessToken,
    };
  }

  function as(user: TestUser) {
    return { Authorization: `Bearer ${user.token}` };
  }

  async function createWallet(creator: TestUser, title: string) {
    const creation = await request(app.getHttpServer())
      .post('/wallets')
      .set(as(creator))
      .send({ title })
      .expect(201);

    return creation.body.id as string;
  }

  function invite(walletId: string, creator: TestUser, invitee: TestUser) {
    return request(app.getHttpServer())
      .post(`/wallets/${walletId}/invitations`)
      .set(as(creator))
      .send({ email: invitee.email });
  }

  async function listNotifications(user: TestUser, query = '') {
    const response = await request(app.getHttpServer())
      .get(`/notifications${query}`)
      .set(as(user))
      .expect(200);

    return response.body as {
      items: NotificationBody[];
      nextCursor: string | null;
      unreadCount: number;
    };
  }

  // Alice crée le porte-monnaie, Bob est membre : Alice paie 90 € pour deux, Bob lui doit 45 €.
  async function createClosedWalletWithDebt() {
    const walletId = await createWallet(alice, 'Colocation');

    await prisma.walletMember.create({
      data: {
        walletId,
        userId: bob.id,
        status: 'MEMBER',
        acceptedAt: new Date(),
      },
    });
    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set(as(alice))
      .send({
        title: 'Loyer',
        amount: 9000,
        date: '2026-11-01',
        paidById: alice.id,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/close`)
      .set(as(alice))
      .expect(200);

    return walletId;
  }

  async function declareRepayment(walletId: string, amount: number) {
    const declaration = await request(app.getHttpServer())
      .post(`/wallets/${walletId}/repayments`)
      .set(as(bob))
      .send({ toUserId: alice.id, amount })
      .expect(201);

    return declaration.body.id as string;
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it.each([
      ['get', '/notifications'],
      ['post', '/notifications/read-all'],
      ['post', '/notifications/any-id/read'],
    ] as const)('refuses %s %s without a token', async (method, path) => {
      await request(app.getHttpServer())[method](path).expect(401);
    });
  });

  describe('invitations', () => {
    it('notifies the invitee, and only the invitee', async () => {
      const walletId = await createWallet(alice, 'Voyage à Paris');

      await invite(walletId, alice, bob).expect(201);

      const bobNotifications = await listNotifications(bob);
      expect(bobNotifications.unreadCount).toBe(1);
      expect(bobNotifications.nextCursor).toBeNull();
      expect(bobNotifications.items).toEqual([
        {
          id: expect.any(String),
          type: 'INVITATION_RECEIVED',
          message: 'Alice vous a invité à Voyage à Paris',
          walletId,
          readAt: null,
          createdAt: expect.any(String),
        },
      ]);

      expect((await listNotifications(alice)).items).toEqual([]);
      expect((await listNotifications(carol)).items).toEqual([]);
    });

    it('creates nothing when the invitation is refused', async () => {
      const walletId = await createWallet(alice, 'Sans invité');

      await invite(walletId, bob, carol).expect(403);

      expect((await listNotifications(carol)).items).toEqual([]);
    });
  });

  describe('POST /notifications/:id/read', () => {
    let notificationId: string;
    let reader: TestUser;

    beforeAll(async () => {
      reader = await createUserAndLogin('Reader');
      const walletId = await createWallet(alice, 'Lecture');
      await invite(walletId, alice, reader).expect(201);
      notificationId = (await listNotifications(reader)).items[0].id;
    });

    it('does not let another user read or mark the notification', async () => {
      await request(app.getHttpServer())
        .post(`/notifications/${notificationId}/read`)
        .set(as(carol))
        .expect(404);
      await request(app.getHttpServer())
        .post(`/notifications/${notificationId}/read`)
        .set(as(alice))
        .expect(404);

      const untouched = await listNotifications(reader);
      expect(untouched.items[0].readAt).toBeNull();
      expect(untouched.unreadCount).toBe(1);
      expect((await listNotifications(carol)).items).not.toContainEqual(
        expect.objectContaining({ id: notificationId }),
      );
    });

    it('marks the notification as read, idempotently', async () => {
      const first = await request(app.getHttpServer())
        .post(`/notifications/${notificationId}/read`)
        .set(as(reader))
        .expect(200);
      expect(first.body.id).toBe(notificationId);
      expect(first.body.readAt).toEqual(expect.any(String));

      const second = await request(app.getHttpServer())
        .post(`/notifications/${notificationId}/read`)
        .set(as(reader))
        .expect(200);
      expect(second.body.readAt).toBe(first.body.readAt);

      expect((await listNotifications(reader)).unreadCount).toBe(0);
    });

    it('answers 404 for an unknown notification', async () => {
      await request(app.getHttpServer())
        .post(`/notifications/${randomUUID()}/read`)
        .set(as(reader))
        .expect(404);
    });
  });

  describe('POST /notifications/read-all', () => {
    it('marks every notification of the caller and leaves the others untouched', async () => {
      const first = await createWallet(alice, 'Un');
      const second = await createWallet(alice, 'Deux');
      await invite(first, alice, bob).expect(201);
      await invite(second, alice, bob).expect(201);
      await invite(first, alice, carol).expect(201);
      expect((await listNotifications(bob)).unreadCount).toBeGreaterThanOrEqual(
        2,
      );
      const carolUnread = (await listNotifications(carol)).unreadCount;

      const unreadBefore = (await listNotifications(bob)).unreadCount;
      const response = await request(app.getHttpServer())
        .post('/notifications/read-all')
        .set(as(bob))
        .expect(200);

      expect(response.body).toEqual({ updated: unreadBefore });
      const after = await listNotifications(bob);
      expect(after.unreadCount).toBe(0);
      expect(after.items.every(({ readAt }) => readAt !== null)).toBe(true);
      expect((await listNotifications(carol)).unreadCount).toBe(carolUnread);
    });
  });

  describe('GET /notifications', () => {
    it('paginates from the most recent to the oldest', async () => {
      const reader = await createUserAndLogin('Paginated');
      for (const title of ['Premier', 'Deuxième', 'Troisième']) {
        const walletId = await createWallet(alice, title);
        await invite(walletId, alice, reader).expect(201);
      }

      const firstPage = await listNotifications(reader, '?limit=2');
      expect(firstPage.items.map(({ message }) => message)).toEqual([
        'Alice vous a invité à Troisième',
        'Alice vous a invité à Deuxième',
      ]);
      expect(firstPage.nextCursor).toEqual(expect.any(String));
      expect(firstPage.unreadCount).toBe(3);

      const secondPage = await listNotifications(
        reader,
        `?limit=2&cursor=${firstPage.nextCursor}`,
      );
      expect(secondPage.items.map(({ message }) => message)).toEqual([
        'Alice vous a invité à Premier',
      ]);
      expect(secondPage.nextCursor).toBeNull();
    });

    it.each(['?limit=0', '?limit=101', '?cursor=not-a-cursor'])(
      'rejects the invalid query %s',
      async (query) => {
        await request(app.getHttpServer())
          .get(`/notifications${query}`)
          .set(as(bob))
          .expect(400);
      },
    );
  });

  describe('confirmed repayments', () => {
    it('notifies the debtor when the recipient confirms, not the recipient', async () => {
      const walletId = await createClosedWalletWithDebt();
      const repaymentId = await declareRepayment(walletId, 1000);
      const bobBefore = (await listNotifications(bob)).unreadCount;
      const aliceBefore = (await listNotifications(alice)).unreadCount;

      await request(app.getHttpServer())
        .post(`/wallets/${walletId}/repayments/${repaymentId}/confirm`)
        .set(as(alice))
        .expect(200);

      const bobNotifications = await listNotifications(bob);
      expect(bobNotifications.unreadCount).toBe(bobBefore + 1);
      expect(bobNotifications.items[0]).toEqual({
        id: expect.any(String),
        type: 'REPAYMENT_CONFIRMED',
        message: 'Votre remboursement de 10 € à Alice a été confirmé',
        walletId,
        readAt: null,
        createdAt: expect.any(String),
      });
      expect((await listNotifications(alice)).unreadCount).toBe(aliceBefore);
    });

    it('creates nothing when the repayment is cancelled or already processed', async () => {
      const walletId = await createClosedWalletWithDebt();
      const repaymentId = await declareRepayment(walletId, 500);
      const before = (await listNotifications(bob)).unreadCount;

      await request(app.getHttpServer())
        .post(`/wallets/${walletId}/repayments/${repaymentId}/cancel`)
        .set(as(bob))
        .expect(200);
      await request(app.getHttpServer())
        .post(`/wallets/${walletId}/repayments/${repaymentId}/confirm`)
        .set(as(alice))
        .expect(409);

      expect((await listNotifications(bob)).unreadCount).toBe(before);
      expect((await listNotifications(alice)).items).not.toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('5 €') }),
      );
    });
  });

  describe('wallet deletion', () => {
    it('keeps the existing notifications readable', async () => {
      const reader = await createUserAndLogin('Orphan');
      const walletId = await createWallet(alice, 'Éphémère');
      await invite(walletId, alice, reader).expect(201);

      await prisma.wallet.delete({ where: { id: walletId } });

      const { items } = await listNotifications(reader);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        message: 'Alice vous a invité à Éphémère',
        walletId,
      });
      await request(app.getHttpServer())
        .post(`/notifications/${items[0].id}/read`)
        .set(as(reader))
        .expect(200);
    });
  });
});
