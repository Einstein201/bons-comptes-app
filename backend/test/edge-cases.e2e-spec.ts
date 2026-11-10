import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface TestUser {
  id: string;
  token: string;
}

describe('IF-24 — cas limites des dépenses (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let walletId: string;
  const emailPrefix = `if24-${randomUUID()}`;
  const expense = { title: 'Courses', amount: 101, date: '2026-10-25' };

  async function createUser(name: string): Promise<TestUser> {
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

  function authorize(user: TestUser) {
    return `Bearer ${user.token}`;
  }

  function expectError(body: unknown, status: number) {
    expect(body).toMatchObject({ statusCode: status });
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) {
      expect(message.length).toBeGreaterThan(0);
      for (const item of message) {
        expect(typeof item).toBe('string');
        expect(item.trim()).not.toBe('');
      }
    } else {
      expect(typeof message).toBe('string');
      expect((message as string).trim()).not.toBe('');
    }
  }

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('IF-24 exige une base PostgreSQL locale dédiée aux tests.');
    }
    const database = new URL(databaseUrl);
    if (
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
    ) {
      throw new Error('IF-24 exige une base PostgreSQL locale dédiée aux tests.');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    owner = await createUser('Alice');
    member = await createUser('Bob');
    outsider = await createUser('Carol');
    const wallet = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', authorize(owner))
      .send({ title: 'IF-24' })
      .expect(201);
    walletId = wallet.body.id;
    await prisma.walletMember.create({
      data: {
        walletId,
        userId: member.id,
        status: 'MEMBER',
        acceptedAt: new Date(),
      },
    });
  });

  it('retourne des erreurs explicites pour 401, 403 et 404', async () => {
    const unauthenticated = await request(app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .expect(401);
    const invalidToken = await request(app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    const forbidden = await request(app.getHttpServer())
      .get(`/wallets/${walletId}`)
      .set('Authorization', authorize(outsider))
      .expect(403);
    const missing = await request(app.getHttpServer())
      .get(`/wallets/${randomUUID()}`)
      .set('Authorization', authorize(owner))
      .expect(404);

    expectError(unauthenticated.body, 401);
    expectError(invalidToken.body, 401);
    expectError(forbidden.body, 403);
    expectError(missing.body, 404);
  });

  it('refuse la création par une personne extérieure sans modifier le portefeuille', async () => {
    const before = await prisma.expense.count({ where: { walletId } });
    const response = await request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', authorize(outsider))
      .send(expense)
      .expect(403);

    expectError(response.body, 403);
    expect(await prisma.expense.count({ where: { walletId } })).toBe(before);
  });

  it.each([0, -1, 1.5])(
    'refuse le montant invalide %s sans créer de dépense',
    async (amount) => {
      const before = await prisma.expense.count({ where: { walletId } });
      const response = await request(app.getHttpServer())
        .post(`/wallets/${walletId}/expenses`)
        .set('Authorization', authorize(owner))
        .send({ ...expense, amount })
        .expect(400);

      expectError(response.body, 400);
      expect(await prisma.expense.count({ where: { walletId } })).toBe(before);
    },
  );

  it('refuse la suppression par un membre autre que le payeur', async () => {
    const created = await request(app.getHttpServer())
      .post(`/wallets/${walletId}/expenses`)
      .set('Authorization', authorize(owner))
      .send(expense)
      .expect(201);

    const response = await request(app.getHttpServer())
      .delete(`/wallets/${walletId}/expenses/${created.body.id}`)
      .set('Authorization', authorize(member))
      .expect(403);
    expectError(response.body, 403);
    expect(
      await prisma.expense.findUnique({ where: { id: created.body.id } }),
    ).toMatchObject({ walletId, amount: 101 });
  });

  it('préserve les centimes et interdit les modifications après clôture', async () => {
    const wallet = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', authorize(owner))
      .send({ title: 'Arrondis IF-24' })
      .expect(201);
    const id = wallet.body.id as string;
    await prisma.walletMember.create({
      data: {
        walletId: id,
        userId: member.id,
        status: 'MEMBER',
        acceptedAt: new Date(),
      },
    });
    const created = await request(app.getHttpServer())
      .post(`/wallets/${id}/expenses`)
      .set('Authorization', authorize(owner))
      .send(expense)
      .expect(201);
    expect(created.body.amount).toBe(101);
    await request(app.getHttpServer())
      .post(`/wallets/${id}/close`)
      .set('Authorization', authorize(owner))
      .expect(200);
    const balance = await request(app.getHttpServer())
      .get(`/wallets/${id}/balance`)
      .set('Authorization', authorize(owner))
      .expect(200);
    expect(balance.body.totalAmount).toBe(101);
    expect(
      balance.body.balances.map((item: { shareAmount: number }) => item.shareAmount),
    ).toEqual([51, 50]);

    const add = await request(app.getHttpServer())
      .post(`/wallets/${id}/expenses`)
      .set('Authorization', authorize(owner))
      .send(expense)
      .expect(409);
    const remove = await request(app.getHttpServer())
      .delete(`/wallets/${id}/expenses/${created.body.id}`)
      .set('Authorization', authorize(owner))
      .expect(409);
    expectError(add.body, 409);
    expectError(remove.body, 409);
    expect(await prisma.expense.count({ where: { walletId: id } })).toBe(1);
    expect(
      await prisma.expense.findUnique({ where: { id: created.body.id } }),
    ).toMatchObject({ amount: 101 });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.wallet.deleteMany({
          where: { createdBy: { email: { startsWith: emailPrefix } } },
        });
        await prisma.user.deleteMany({
          where: { email: { startsWith: emailPrefix } },
        });
      }
    } finally {
      if (app) await app.close();
    }
  });
});
