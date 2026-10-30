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

interface RepaymentItem {
  id: string;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
  status: string;
  canConfirm: boolean;
  canCancel: boolean;
}

describe('Repayments list (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `repayments-list-${randomUUID()}`;

  // Alice crée le porte-monnaie, Bob a tout payé, Carol et Dave le remboursent.
  // Erin est seulement invitée, Frank n'a aucun lien avec le porte-monnaie.
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;
  let erin: TestUser;
  let frank: TestUser;

  let walletId: string;
  const ids = { paid: '', cancelled: '', carolPending: '', davePending: '' };

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

  async function createWallet() {
    const creation = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Vacances' })
      .expect(201);
    const id = creation.body.id as string;

    await prisma.walletMember.createMany({
      data: [
        {
          walletId: id,
          userId: bob.id,
          status: 'MEMBER',
          acceptedAt: new Date(),
        },
        {
          walletId: id,
          userId: carol.id,
          status: 'MEMBER',
          acceptedAt: new Date(),
        },
        {
          walletId: id,
          userId: dave.id,
          status: 'MEMBER',
          acceptedAt: new Date(),
        },
        { walletId: id, userId: erin.id, status: 'INVITED' },
      ],
    });

    return id;
  }

  // Bob paie 90 € pour 4 : Alice, Carol et Dave lui doivent 22,50 € chacun.
  async function createClosedWallet() {
    const id = await createWallet();

    await request(app.getHttpServer())
      .post(`/wallets/${id}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Location',
        amount: 9000,
        date: '2026-10-25',
        paidById: bob.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/wallets/${id}/close`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    return id;
  }

  async function declare(debtor: TestUser, amount: number) {
    const response = await request(app.getHttpServer())
      .post(`/wallets/${walletId}/repayments`)
      .set('Authorization', `Bearer ${debtor.token}`)
      .send({ toUserId: bob.id, amount })
      .expect(201);

    return response.body.id as string;
  }

  function listRepayments(id: string, user: TestUser, query: object = {}) {
    return request(app.getHttpServer())
      .get(`/wallets/${id}/repayments`)
      .query(query)
      .set('Authorization', `Bearer ${user.token}`);
  }

  async function itemsOf(user: TestUser, query: object = {}) {
    const response = await listRepayments(walletId, user, query).expect(200);

    return response.body.items as RepaymentItem[];
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
    frank = await createUserAndLogin('Frank');

    walletId = await createClosedWallet();

    ids.paid = await declare(carol, 500);
    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/repayments/${ids.paid}/confirm`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);

    ids.cancelled = await declare(carol, 300);
    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/repayments/${ids.cancelled}/cancel`)
      .set('Authorization', `Bearer ${carol.token}`)
      .expect(200);

    ids.carolPending = await declare(carol, 1000);
    ids.davePending = await declare(dave, 700);

    // Dates fixes pour connaître l'ordre attendu.
    const dates = [
      [ids.paid, '2026-10-28T10:00:00.000Z'],
      [ids.cancelled, '2026-10-28T10:01:00.000Z'],
      [ids.carolPending, '2026-10-28T10:02:00.000Z'],
      [ids.davePending, '2026-10-28T10:03:00.000Z'],
    ];
    for (const [id, date] of dates) {
      await prisma.repayment.update({
        where: { id },
        data: { createdAt: new Date(date) },
      });
    }
  });

  describe('GET /wallets/:walletId/repayments', () => {
    it('lists every repayment of the wallet, newest first', async () => {
      const response = await listRepayments(walletId, dave).expect(200);

      expect(response.body.nextCursor).toBeNull();
      expect(response.body.items.map((item: RepaymentItem) => item.id)).toEqual(
        [ids.davePending, ids.carolPending, ids.cancelled, ids.paid],
      );
      expect(response.body.items[1]).toEqual({
        id: ids.carolPending,
        fromUser: { id: carol.id, name: 'Carol' },
        toUser: { id: bob.id, name: 'Bob' },
        amount: 1000,
        status: 'PENDING',
        createdAt: '2026-10-28T10:02:00.000Z',
        paidAt: null,
        canConfirm: false,
        canCancel: false,
      });
    });

    it('exposes only the id and the name of the users', async () => {
      for (const item of await itemsOf(alice)) {
        expect(Object.keys(item.fromUser).sort()).toEqual(['id', 'name']);
        expect(Object.keys(item.toUser).sort()).toEqual(['id', 'name']);
      }
    });

    it.each([
      ['PENDING', () => [ids.davePending, ids.carolPending]],
      ['PAID', () => [ids.paid]],
      ['CANCELLED', () => [ids.cancelled]],
    ])('returns only the %s repayments', async (status, expectedIds) => {
      const items = await itemsOf(alice, { status });

      expect(items.map((item) => item.id)).toEqual(expectedIds());
    });
  });

  describe('actions of each user', () => {
    async function actionsOnCarolPending(user: TestUser) {
      const items = await itemsOf(user);
      const item = items.find(
        (repayment) => repayment.id === ids.carolPending,
      )!;

      return { canConfirm: item.canConfirm, canCancel: item.canCancel };
    }

    it.each([
      [
        'the sender (Carol)',
        () => carol,
        { canConfirm: false, canCancel: true },
      ],
      [
        'the recipient (Bob)',
        () => bob,
        { canConfirm: true, canCancel: false },
      ],
      [
        'the creator (Alice)',
        () => alice,
        { canConfirm: true, canCancel: false },
      ],
      [
        'another member (Dave)',
        () => dave,
        { canConfirm: false, canCancel: false },
      ],
    ])('gives the right actions to %s', async (_case, getUser, expected) => {
      expect(await actionsOnCarolPending(getUser())).toEqual(expected);
    });

    it('gives no action on a paid or cancelled repayment', async () => {
      for (const user of [alice, bob, carol]) {
        const items = await itemsOf(user);
        const finished = items.filter((item) => item.status !== 'PENDING');

        expect(finished).toHaveLength(2);
        for (const item of finished) {
          expect([item.canConfirm, item.canCancel]).toEqual([false, false]);
        }
      }
    });
  });

  describe('pagination', () => {
    it('returns every repayment once, even with identical dates', async () => {
      // Porte-monnaie encore ouvert : la liste est disponible quel que soit son statut.
      const otherWalletId = await createWallet();
      const sameDate = new Date('2026-10-29T12:00:00.000Z');
      await prisma.repayment.createMany({
        data: [1, 2, 3, 4, 5].map((amount) => ({
          walletId: otherWalletId,
          fromUserId: carol.id,
          toUserId: bob.id,
          amount,
          createdAt: sameDate,
        })),
      });

      const seenIds: string[] = [];
      let cursor: string | null = null;
      do {
        const response: request.Response = await listRepayments(
          otherWalletId,
          carol,
          cursor ? { limit: 2, cursor } : { limit: 2 },
        ).expect(200);

        expect(response.body.items.length).toBeLessThanOrEqual(2);
        seenIds.push(
          ...response.body.items.map((item: RepaymentItem) => item.id),
        );
        cursor = response.body.nextCursor;
      } while (cursor);

      const storedIds = await prisma.repayment.findMany({
        where: { walletId: otherWalletId },
        select: { id: true },
        orderBy: { id: 'desc' },
      });
      expect(seenIds).toEqual(storedIds.map((row) => row.id));
    });

    it('never returns the repayments of another wallet', async () => {
      const items = await itemsOf(alice, { limit: 100 });

      expect(items).toHaveLength(4);
    });

    it('returns an empty list for a wallet without repayment', async () => {
      const emptyWalletId = await createWallet();

      const response = await listRepayments(emptyWalletId, alice).expect(200);

      expect(response.body).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('errors', () => {
    it.each([
      ['an unknown status', { status: 'DONE' }],
      ['a limit of 0', { limit: 0 }],
      ['a limit above 100', { limit: 101 }],
      ['an invalid cursor', { cursor: 'not-a-cursor' }],
    ])('returns 400 for %s', async (_case, query) => {
      await listRepayments(walletId, alice, query).expect(400);
    });

    it('rejects a request without token with HTTP 401', async () => {
      await request(app.getHttpServer())
        .get(`/wallets/${walletId}/repayments`)
        .expect(401);
    });

    it.each([
      ['an invited user (Erin)', () => erin],
      ['a user who is not in the wallet (Frank)', () => frank],
    ])('returns 403 to %s', async (_case, getUser) => {
      await listRepayments(walletId, getUser()).expect(403);
    });

    it('returns 404 when the wallet does not exist', async () => {
      await listRepayments(randomUUID(), alice).expect(404);
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