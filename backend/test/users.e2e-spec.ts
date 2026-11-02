import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('User registration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `uc01-${randomUUID()}`;
  let nextEmailId = 0;

  function createTestEmail() {
    nextEmailId += 1;
    return `${emailPrefix}-${nextEmailId}@example.com`;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'if41-test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'if41-test-refresh-secret';

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
  });

  it('persists a user with a hashed password and does not return the password', async () => {
    const input = {
      email: createTestEmail(),
      name: 'Alice',
      password: 'motdepasse123',
    };

    const response = await request(app.getHttpServer())
      .post('/users')
      .send(input)
      .expect(201);

    expect(response.body).toMatchObject({
      email: input.email,
      name: input.name,
    });
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('createdAt');
    expect(response.body).not.toHaveProperty('password');

    const persistedUser = await prisma.user.findUnique({
      where: { email: input.email },
    });
    expect(persistedUser).not.toBeNull();

    if (!persistedUser) {
      throw new Error('The created user was not persisted.');
    }

    expect(persistedUser.password).not.toBe(input.password);
    expect(await compare(input.password, persistedUser.password)).toBe(true);
  });

  it('rejects a duplicate email with HTTP 409', async () => {
    const input = {
      email: createTestEmail(),
      name: 'Alice',
      password: 'motdepasse123',
    };

    await request(app.getHttpServer()).post('/users').send(input).expect(201);
    await request(app.getHttpServer())
      .post('/users')
      .send({ ...input, name: 'Alice Dupont' })
      .expect(409);
  });

  it.each([
    [
      'invalid email',
      { email: 'invalid-email', name: 'Alice', password: 'motdepasse123' },
    ],
    [
      'missing name',
      { email: 'alice@example.com', name: '', password: 'motdepasse123' },
    ],
    [
      'short password',
      { email: 'alice@example.com', name: 'Alice', password: 'short' },
    ],
    [
      'unexpected property',
      {
        email: 'alice@example.com',
        name: 'Alice',
        password: 'motdepasse123',
        isAdmin: true,
      },
    ],
  ])('rejects a request with %s', async (_case, input) => {
    await request(app.getHttpServer()).post('/users').send(input).expect(400);
  });

  it('updates the authenticated profile name and exposes it through auth/me', async () => {
    const input = {
      email: createTestEmail(),
      name: 'Alice',
      password: 'motdepasse123',
    };
    const server = app.getHttpServer();

    await request(server).post('/users').send(input).expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);

    const authorization = `Bearer ${login.body.accessToken}`;
    const updated = await request(server)
      .patch('/users/me')
      .set('Authorization', authorization)
      .send({ name: 'Alice mise à jour' })
      .expect(200);

    expect(updated.body).toEqual({
      userId: expect.any(String),
      name: 'Alice mise à jour',
    });
    expect(updated.body).not.toHaveProperty('password');

    await request(server)
      .get('/auth/me')
      .set('Authorization', authorization)
      .expect(200)
      .expect({ userId: updated.body.userId, name: 'Alice mise à jour' });
  });

  it.each([
    ['missing', {}],
    ['empty', { name: '' }],
    ['whitespace only', { name: '   \t\n' }],
    ['not a string', { name: 123 }],
    ['too long', { name: 'a'.repeat(101) }],
    ['unexpected user id', { name: 'Bob', userId: 'another-user' }],
  ])('rejects an invalid profile update: %s', async (_case, body) => {
    const input = {
      email: createTestEmail(),
      name: 'Validation user',
      password: 'motdepasse123',
    };
    await request(app.getHttpServer()).post('/users').send(input).expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/users/me')
      .send(body)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(400);
  });

  it('rejects a profile update without authentication', async () => {
    await request(app.getHttpServer())
      .patch('/users/me')
      .send({ name: 'Alice' })
      .expect(401);
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: { email: { startsWith: emailPrefix } },
      });
    } finally {
      await app.close();
    }
  });
});
