import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface TestUser {
  id: string;
  token: string;
}

describe('Expense splits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `expense-splits-${randomUUID()}`;

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

  // Alice crée le porte-monnaie ; Bob et Carol sont membres, Dave est invité.
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
        { walletId, userId: dave.id, status: 'INVITED' },
      ],
    });

    return walletId;
  }

  function postExpense(walletId: string, amount: number) {
    return request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Courses', amount, date: '2026-10-25' });
  }

  async function createExpense(walletId: string, amount: number) {
    const response = await postExpense(walletId, amount).expect(201);

    return response.body.id as string;
  }

  function splitsOf(expenseId: string) {
    return prisma.expenseSplit.findMany({
      where: { expenseId },
      select: { userId: true, amount: true },
    });
  }

  function sortById<T extends { id: string }>(users: T[]) {
    return [...users].sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async function acceptInvitation(walletId: string, user: TestUser) {
    await prisma.walletMember.update({
      where: { walletId_userId: { walletId, userId: user.id } },
      data: { status: 'MEMBER', acceptedAt: new Date() },
    });
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

  afterAll(async () => {
    const users = { email: { startsWith: emailPrefix } };

    await prisma.wallet.deleteMany({ where: { createdBy: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('gives an equal share to each accepted member, not to the invited ones', async () => {
    const walletId = await createWallet();

    const expenseId = await createExpense(walletId, 9000);

    const splits = await splitsOf(expenseId);
    expect(splits).toHaveLength(3);
    expect(splits).toEqual(
      expect.arrayContaining(
        [alice, bob, carol].map((user) => ({ userId: user.id, amount: 3000 })),
      ),
    );
  });

  it('gives the remaining cents by ascending user id and keeps the exact total', async () => {
    const walletId = await createWallet();

    const expenseId = await createExpense(walletId, 10001);

    const [first, second, third] = sortById([alice, bob, carol]);
    const splits = await splitsOf(expenseId);
    expect(splits).toEqual(
      expect.arrayContaining([
        { userId: first.id, amount: 3334 },
        { userId: second.id, amount: 3334 },
        { userId: third.id, amount: 3333 },
      ]),
    );
    expect(splits.reduce((sum, split) => sum + split.amount, 0)).toBe(10001);
  });

  it('does not give a late member any share of the previous expenses', async () => {
    const walletId = await createWallet();
    const previousExpenseId = await createExpense(walletId, 9000);

    await acceptInvitation(walletId, dave);
    const nextExpenseId = await createExpense(walletId, 8000);

    const previousSplits = await splitsOf(previousExpenseId);
    expect(previousSplits.map((split) => split.userId)).not.toContain(dave.id);
    expect(previousSplits).toHaveLength(3);

    const nextSplits = await splitsOf(nextExpenseId);
    expect(nextSplits).toHaveLength(4);
    expect(nextSplits).toContainEqual({ userId: dave.id, amount: 2000 });
  });

  it('computes the balance from the recorded shares', async () => {
    const walletId = await createWallet();
    await createExpense(walletId, 9000);
    await acceptInvitation(walletId, dave);
    await createExpense(walletId, 8000);

    await request(app.getHttpServer())
      .post(`/wallets/${walletId}/close`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/wallets/${walletId}/balance`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const balanceOf = (user: TestUser) =>
      response.body.balances.find(
        (item: { userId: string }) => item.userId === user.id,
      );

    expect(response.body.totalAmount).toBe(17000);
    expect(balanceOf(alice)).toMatchObject({
      paidAmount: 17000,
      shareAmount: 5000,
      balance: 12000,
    });
    expect(balanceOf(bob)).toMatchObject({ shareAmount: 5000, balance: -5000 });
    expect(balanceOf(carol)).toMatchObject({
      shareAmount: 5000,
      balance: -5000,
    });
    expect(balanceOf(dave)).toMatchObject({
      shareAmount: 2000,
      balance: -2000,
    });
  });

  it('rolls back the expense and its shares when the transaction fails', async () => {
    const walletId = await createWallet();
    const runTransaction = prisma.$transaction.bind(prisma) as (
      callback: (transaction: unknown) => Promise<unknown>,
      options?: unknown,
    ) => Promise<unknown>;

    // Échec provoqué après l'écriture de la dépense et de ses parts.
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((
      callback: (transaction: unknown) => Promise<unknown>,
    ) =>
      runTransaction((transaction) =>
        callback(
          new Proxy(transaction as object, {
            get: (target, property, receiver) =>
              property === 'wallet'
                ? {
                    update: () => Promise.reject(new Error('Échec simulé')),
                  }
                : Reflect.get(target, property, receiver),
          }),
        ),
      )) as never);

    await postExpense(walletId, 9000).expect(500);
    spy.mockRestore();

    expect(await prisma.expense.count({ where: { walletId } })).toBe(0);
    expect(
      await prisma.expenseSplit.count({ where: { expense: { walletId } } }),
    ).toBe(0);
  });

  it('refuses a second share for the same user and expense', async () => {
    const walletId = await createWallet();
    const expenseId = await createExpense(walletId, 9000);

    await expect(
      prisma.expenseSplit.create({
        data: { expenseId, userId: alice.id, amount: 1 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
