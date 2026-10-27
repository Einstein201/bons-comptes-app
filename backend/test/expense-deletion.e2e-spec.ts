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

describe('Expense deletion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `expense-deletion-${randomUUID()}`;

  let alice: TestUser;
  let bob: TestUser;
  let dave: TestUser;

  let openWalletId: string;
  let otherWalletId: string;
  let closedWalletId: string;

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

  async function createExpense(
    walletId: string,
    creator: TestUser,
    amount: number,
    payer: TestUser = creator,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', `Bearer ${creator.token}`)
      .send({
        title: 'Courses',
        amount,
        date: '2026-10-25',
        paidById: payer.id,
      })
      .expect(201);

    return response.body.id as string;
  }

  function deleteExpense(walletId: string, expenseId: string, user: TestUser) {
    return request(app.getHttpServer())
      .delete(`/wallets/${walletId}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  async function expenseExists(expenseId: string) {
    return (await prisma.expense.count({ where: { id: expenseId } })) === 1;
  }

  async function totalOf(walletId: string, user: TestUser) {
    const response = await request(app.getHttpServer())
      .get(`/wallets/${walletId}/expenses`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    return response.body.totalAmount as number;
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
    dave = await createUserAndLogin('Dave');

    openWalletId = await createWallet(alice, 'Vacances');
    await prisma.walletMember.create({
      data: {
        walletId: openWalletId,
        userId: bob.id,
        status: 'MEMBER',
        acceptedAt: new Date(),
      },
    });

    otherWalletId = await createWallet(alice, 'Autre porte-monnaie');
    closedWalletId = await createWallet(alice, 'Ancien voyage');
  });

  it('rejects a deletion without token with HTTP 401', async () => {
    const expenseId = await createExpense(openWalletId, alice, 1000);

    await request(app.getHttpServer())
      .delete(`/wallets/${openWalletId}/expenses/${expenseId}`)
      .expect(401);

    expect(await expenseExists(expenseId)).toBe(true);
  });

  it('lets the payer who also created the expense delete it with HTTP 204', async () => {
    const expenseId = await createExpense(openWalletId, alice, 1000);

    const response = await deleteExpense(openWalletId, expenseId, alice).expect(
      204,
    );

    expect(response.text).toBe('');
    expect(await expenseExists(expenseId)).toBe(false);
  });

  it('lets only the payer delete an expense created by someone else', async () => {
    // Alice saisit une dépense payée par Bob : seul Bob peut la supprimer.
    const expenseId = await createExpense(openWalletId, alice, 1000, bob);

    await deleteExpense(openWalletId, expenseId, alice).expect(403);
    expect(await expenseExists(expenseId)).toBe(true);

    await deleteExpense(openWalletId, expenseId, bob).expect(204);
    expect(await expenseExists(expenseId)).toBe(false);
  });

  it('returns 403 to another member who is not the payer', async () => {
    const expenseId = await createExpense(openWalletId, alice, 1000);

    await deleteExpense(openWalletId, expenseId, bob).expect(403);

    expect(await expenseExists(expenseId)).toBe(true);
  });

  it('returns 403 to a user who is not a member of the wallet', async () => {
    const expenseId = await createExpense(openWalletId, alice, 1000);

    await deleteExpense(openWalletId, expenseId, dave).expect(403);

    expect(await expenseExists(expenseId)).toBe(true);
  });

  it('returns 404 when the expense does not exist', async () => {
    await deleteExpense(openWalletId, randomUUID(), alice).expect(404);
  });

  it('returns 404 when the expense belongs to another wallet', async () => {
    const expenseId = await createExpense(otherWalletId, alice, 1000);

    await deleteExpense(openWalletId, expenseId, alice).expect(404);

    expect(await expenseExists(expenseId)).toBe(true);
  });

  it('returns 409 when the wallet is closed', async () => {
    const expenseId = await createExpense(closedWalletId, alice, 1000);
    await prisma.wallet.update({
      where: { id: closedWalletId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    await deleteExpense(closedWalletId, expenseId, alice).expect(409);

    expect(await expenseExists(expenseId)).toBe(true);
  });

  it('deletes the splits of the expense in cascade', async () => {
    const expenseId = await createExpense(openWalletId, alice, 1000);
    await prisma.expenseSplit.createMany({
      data: [
        { expenseId, userId: alice.id, amount: 500 },
        { expenseId, userId: bob.id, amount: 500 },
      ],
    });

    await deleteExpense(openWalletId, expenseId, alice).expect(204);

    expect(await prisma.expenseSplit.count({ where: { expenseId } })).toBe(0);
  });

  it('updates the total of the wallet after the deletion', async () => {
    const walletId = await createWallet(alice, 'Total');
    await createExpense(walletId, alice, 1500);
    const expenseId = await createExpense(walletId, alice, 2500);
    expect(await totalOf(walletId, alice)).toBe(4000);

    await deleteExpense(walletId, expenseId, alice).expect(204);

    expect(await totalOf(walletId, alice)).toBe(1500);
  });

  it('refreshes the updatedAt of the wallet', async () => {
    const expenseId = await createExpense(openWalletId, alice, 1000);
    const oldDate = new Date('2020-01-01T00:00:00.000Z');
    await prisma.wallet.update({
      where: { id: openWalletId },
      data: { updatedAt: oldDate },
    });

    await deleteExpense(openWalletId, expenseId, alice).expect(204);

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: openWalletId },
    });
    expect(wallet.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  afterAll(async () => {
    try {
      // Les dépenses, leurs parts et les adhésions sont supprimées en cascade avec le porte-monnaie.
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
