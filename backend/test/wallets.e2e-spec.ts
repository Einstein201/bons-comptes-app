import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Wallet creation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let accessToken: string;
  const emailPrefix = `wallets-${randomUUID()}`;

  function createTestTitle() {
    return `Vacances ${randomUUID()}`;
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

    const credentials = {
      email: `${emailPrefix}@example.com`,
      password: 'motdepasse123',
    };
    const registration = await request(app.getHttpServer())
      .post('/users')
      .send({ ...credentials, name: 'Alice' })
      .expect(201);
    userId = registration.body.id;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    accessToken = login.body.accessToken;
  });

  it('rejects a request without token with HTTP 401 and creates nothing', async () => {
    const title = createTestTitle();

    await request(app.getHttpServer())
      .post('/wallets')
      .send({ title })
      .expect(401);

    expect(await prisma.wallet.count({ where: { title } })).toBe(0);
  });

  it('creates the wallet and its creator membership with a valid token', async () => {
    const title = createTestTitle();

    const response = await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title, description: 'Dépenses du voyage' })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      title,
      description: 'Dépenses du voyage',
      status: 'OPEN',
      createdAt: expect.any(String),
    });

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { members: true },
    });
    expect(wallet.createdById).toBe(userId);
    expect(wallet.members).toHaveLength(1);
    expect(wallet.members[0]).toMatchObject({ userId, status: 'MEMBER' });
    expect(wallet.members[0].acceptedAt).toBeInstanceOf(Date);
  });

  it('rejects a createdById in the body with HTTP 400 and creates nothing', async () => {
    const title = createTestTitle();

    await request(app.getHttpServer())
      .post('/wallets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title, createdById: randomUUID() })
      .expect(400);

    expect(await prisma.wallet.count({ where: { title } })).toBe(0);
  });

  afterAll(async () => {
    try {
      // Les membres sont supprimés en cascade avec leur porte-monnaie ; les utilisateurs sont en onDelete: Restrict.
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
