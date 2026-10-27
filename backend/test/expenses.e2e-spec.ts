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

describe('Expenses (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = randomUUID();
  const emailPrefix = `expenses-${runId}`;

  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;

  let openWalletId: string;
  let closedWalletId: string;
  let emptyWalletId: string;
  let sortedWalletId: string;

  const validExpense = { title: 'Courses', amount: 4599, date: '2026-10-25' };

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

  async function createWallet(owner: TestUser, title: string) {
    const response = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title })
      .expect(201);

    return response.body.id as string;
  }

  async function addMembership(
    walletId: string,
    userId: string,
    status: 'MEMBER' | 'INVITED',
  ) {
    await prisma.walletMember.create({
      data: {
        walletId,
        userId,
        status,
        acceptedAt: status === 'MEMBER' ? new Date() : null,
      },
    });
  }

  function postExpense(walletId: string, user: TestUser, body: object) {
    return request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(body);
  }

  function getExpenses(
    walletId: string,
    user: TestUser,
    query: Record<string, string> = {},
  ) {
    return request(app.getHttpServer())
      .get(`/wallets/${walletId}/expenses`)
      .query(query)
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

    openWalletId = await createWallet(alice, 'Vacances');
    await addMembership(openWalletId, bob.id, 'MEMBER');
    await addMembership(openWalletId, carol.id, 'INVITED');

    closedWalletId = await createWallet(alice, 'Ancien voyage');
    await postExpense(closedWalletId, alice, validExpense).expect(201);
    await prisma.wallet.update({
      where: { id: closedWalletId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    emptyWalletId = await createWallet(alice, 'Sans dépense');

    // Identifiants fixés pour connaître l'ordre des deux dépenses du même jour (x3b avant x3a).
    sortedWalletId = await createWallet(alice, 'Tri et pagination');
    const seeds = [
      ['x1', '2026-10-01', 100],
      ['x2', '2026-10-02', 200],
      ['x3a', '2026-10-03', 300],
      ['x3b', '2026-10-03', 400],
      ['x4', '2026-10-04', 500],
    ] as const;
    await prisma.expense.createMany({
      data: seeds.map(([key, date, amount]) => ({
        id: `${runId}-${key}`,
        walletId: sortedWalletId,
        title: `Dépense ${key}`,
        amount,
        date: new Date(date),
        paidById: alice.id,
        createdById: alice.id,
      })),
    });
  });

  describe('authentication', () => {
    it('rejects a creation without token with HTTP 401', async () => {
      await request(app.getHttpServer())
        .post(`/wallets/${openWalletId}/expenses`)
        .send(validExpense)
        .expect(401);
    });

    it('rejects a listing without token with HTTP 401', async () => {
      await request(app.getHttpServer())
        .get(`/wallets/${openWalletId}/expenses`)
        .expect(401);
    });
  });

  describe('POST /wallets/:walletId/expenses', () => {
    it('creates an expense paid by the authenticated user by default', async () => {
      const response = await postExpense(
        openWalletId,
        alice,
        validExpense,
      ).expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        title: 'Courses',
        amount: 4599,
        date: '2026-10-25',
        createdAt: expect.any(String),
        paidBy: { id: alice.id, name: 'Alice' },
      });

      const saved = await prisma.expense.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(saved.amount).toBe(4599);
      expect(saved.paidById).toBe(alice.id);
      expect(saved.createdById).toBe(alice.id);
      expect(saved.walletId).toBe(openWalletId);
    });

    it('accepts another accepted member as payer', async () => {
      const response = await postExpense(openWalletId, alice, {
        ...validExpense,
        paidById: bob.id,
      }).expect(201);

      expect(response.body.paidBy).toEqual({ id: bob.id, name: 'Bob' });

      const saved = await prisma.expense.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(saved.createdById).toBe(alice.id);
    });

    it('refreshes the updatedAt of the wallet', async () => {
      const oldDate = new Date('2020-01-01T00:00:00.000Z');
      await prisma.wallet.update({
        where: { id: openWalletId },
        data: { updatedAt: oldDate },
      });

      await postExpense(openWalletId, bob, validExpense).expect(201);

      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: openWalletId },
      });
      expect(wallet.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('returns 404 when the wallet does not exist', async () => {
      await postExpense(randomUUID(), alice, validExpense).expect(404);
    });

    it('returns 403 to a user who is not a member', async () => {
      await postExpense(openWalletId, dave, validExpense).expect(403);
    });

    it('returns 403 to a user who is only invited', async () => {
      await postExpense(openWalletId, carol, validExpense).expect(403);
    });

    it('returns 403 when the payer is only invited', async () => {
      await postExpense(openWalletId, alice, {
        ...validExpense,
        paidById: carol.id,
      }).expect(403);
    });

    it('returns 403 when the payer is not a member', async () => {
      await postExpense(openWalletId, alice, {
        ...validExpense,
        paidById: dave.id,
      }).expect(403);
    });

    it('returns 409 when the wallet is closed', async () => {
      const before = await prisma.expense.count({
        where: { walletId: closedWalletId },
      });

      await postExpense(closedWalletId, alice, validExpense).expect(409);

      expect(
        await prisma.expense.count({ where: { walletId: closedWalletId } }),
      ).toBe(before);
    });

    it.each([
      ['a zero amount', { amount: 0 }],
      ['a decimal amount', { amount: 45.99 }],
      ['an amount as text', { amount: '4599' }],
      ['a date with time', { date: '2026-10-25T10:00:00Z' }],
      ['an impossible date', { date: '2026-02-30' }],
      ['a missing date', { date: undefined }],
      ['a client-supplied createdById', { createdById: randomUUID() }],
    ])('returns 400 for %s', async (_case, change) => {
      await postExpense(openWalletId, alice, {
        ...validExpense,
        ...change,
      }).expect(400);
    });
  });

  describe('GET /wallets/:walletId/expenses', () => {
    it('sorts by date then id, newest first, with the total of the wallet', async () => {
      const response = await getExpenses(sortedWalletId, alice).expect(200);

      expect(
        response.body.items.map((item: { id: string }) => item.id),
      ).toEqual(
        ['x4', 'x3b', 'x3a', 'x2', 'x1'].map((key) => `${runId}-${key}`),
      );
      expect(response.body.nextCursor).toBeNull();
      expect(response.body.totalAmount).toBe(1500);
    });

    it('paginates with a cursor and keeps the total of the whole wallet', async () => {
      const ids: string[] = [];
      let cursor: string | null = null;

      do {
        const response: request.Response = await getExpenses(
          sortedWalletId,
          alice,
          cursor ? { limit: '2', cursor } : { limit: '2' },
        ).expect(200);

        expect(response.body.items.length).toBeLessThanOrEqual(2);
        expect(response.body.totalAmount).toBe(1500);
        ids.push(...response.body.items.map((item: { id: string }) => item.id));
        cursor = response.body.nextCursor;
      } while (cursor);

      expect(ids).toEqual(
        ['x4', 'x3b', 'x3a', 'x2', 'x1'].map((key) => `${runId}-${key}`),
      );
    });

    it('returns an empty list and a total of 0 for a wallet without expense', async () => {
      const response = await getExpenses(emptyWalletId, alice).expect(200);

      expect(response.body).toEqual({
        items: [],
        nextCursor: null,
        totalAmount: 0,
      });
    });

    it('lets a member read the expenses of a closed wallet', async () => {
      const response = await getExpenses(closedWalletId, alice).expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.totalAmount).toBe(4599);
    });

    it('never returns sensitive data', async () => {
      const response = await getExpenses(openWalletId, bob).expect(200);
      const body = JSON.stringify(response.body);

      expect(body).not.toMatch(/password|email|createdById/i);
      expect(body).not.toContain('motdepasse123');
    });

    it('returns 404 when the wallet does not exist', async () => {
      await getExpenses(randomUUID(), alice).expect(404);
    });

    it('returns 403 to a user who is not a member', async () => {
      await getExpenses(openWalletId, dave).expect(403);
    });

    it('returns 403 to a user who is only invited', async () => {
      await getExpenses(openWalletId, carol).expect(403);
    });

    it.each(['0', '101', 'abc'])('returns 400 for limit=%s', async (limit) => {
      await getExpenses(sortedWalletId, alice, { limit }).expect(400);
    });

    it('returns 400 for an invalid cursor', async () => {
      await getExpenses(sortedWalletId, alice, {
        cursor: 'not-a-cursor',
      }).expect(400);
    });
  });

  afterAll(async () => {
    try {
      // Les dépenses et les adhésions sont supprimées en cascade avec leur porte-monnaie.
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
