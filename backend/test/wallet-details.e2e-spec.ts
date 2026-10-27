import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Wallet details (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `wallet-details-${randomUUID()}`;

  let alice: { id: string; token: string };
  let bob: { id: string; token: string };
  let carol: { id: string; token: string };
  let walletId: string;

  async function createUserAndLogin(name: string) {
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

  function getWallet(id: string, token: string) {
    return request(app.getHttpServer())
      .get(`/wallets/${id}`)
      .set('Authorization', `Bearer ${token}`);
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

    const creation = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Vacances à Montréal', description: 'Dépenses du voyage' })
      .expect(201);
    walletId = creation.body.id;

    // Bob est invité une minute après la création : l'ordre des membres est donc connu.
    await prisma.walletMember.create({
      data: {
        walletId,
        userId: bob.id,
        status: 'INVITED',
        invitedAt: new Date(Date.now() + 60_000),
      },
    });
  });

  it('rejects a request without token with HTTP 401', async () => {
    await request(app.getHttpServer()).get(`/wallets/${walletId}`).expect(401);
  });

  it('returns 404 when the wallet does not exist', async () => {
    await getWallet(randomUUID(), alice.token).expect(404);
  });

  it('returns 403 to a user who is not a member', async () => {
    await getWallet(walletId, carol.token).expect(403);
  });

  it('returns 403 to a user who is only invited', async () => {
    await getWallet(walletId, bob.token).expect(403);
  });

  it('lets a member read an open wallet with all memberships', async () => {
    const response = await getWallet(walletId, alice.token).expect(200);

    expect(response.body).toEqual({
      wallet: {
        id: walletId,
        title: 'Vacances à Montréal',
        description: 'Dépenses du voyage',
        status: 'OPEN',
        createdAt: expect.any(String),
      },
      members: {
        items: [
          {
            userId: alice.id,
            name: 'Alice',
            email: `${emailPrefix}-alice@example.com`,
            status: 'MEMBER',
            invitedAt: expect.any(String),
            acceptedAt: expect.any(String),
          },
          {
            userId: bob.id,
            name: 'Bob',
            email: `${emailPrefix}-bob@example.com`,
            status: 'INVITED',
            invitedAt: expect.any(String),
            acceptedAt: null,
          },
        ],
        nextCursor: null,
      },
    });
  });

  it('never returns a password', async () => {
    const response = await getWallet(walletId, alice.token).expect(200);

    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(JSON.stringify(response.body)).not.toContain('motdepasse123');
  });

  it('lets a member read a closed wallet', async () => {
    await prisma.wallet.update({
      where: { id: walletId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    const response = await getWallet(walletId, alice.token).expect(200);
    expect(response.body.wallet.status).toBe('CLOSED');

    await prisma.wallet.update({
      where: { id: walletId },
      data: { status: 'OPEN', closedAt: null },
    });
  });

  it('paginates the memberships with a cursor', async () => {
    const firstPage = await getWallet(walletId, alice.token)
      .query({ limit: 1 })
      .expect(200);

    expect(firstPage.body.members.items).toHaveLength(1);
    expect(firstPage.body.members.items[0].userId).toBe(alice.id);
    expect(firstPage.body.members.nextCursor).toEqual(expect.any(String));

    const secondPage = await getWallet(walletId, alice.token)
      .query({ limit: 1, cursor: firstPage.body.members.nextCursor })
      .expect(200);

    expect(secondPage.body.members.items).toHaveLength(1);
    expect(secondPage.body.members.items[0].userId).toBe(bob.id);
    expect(secondPage.body.members.nextCursor).toBeNull();
  });

  it('rejects a limit above 100 with HTTP 400', async () => {
    await getWallet(walletId, alice.token).query({ limit: 101 }).expect(400);
  });

  afterAll(async () => {
    try {
      // Les adhésions sont supprimées en cascade avec le porte-monnaie.
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
