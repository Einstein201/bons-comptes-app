import { ConfigModule } from '@nestjs/config';
import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const findUnique = vi.fn();

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: { user: { findUnique } } }],
  exports: [PrismaService],
})
class PrismaStubModule {}

describe('Auth flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaStubModule, AuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const password = await bcrypt.hash('motdepasse123', 10);
    findUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) =>
      where.id === 'user-1' || where.email === 'alice@example.com'
        ? Promise.resolve({ id: 'user-1', email: 'alice@example.com', password })
        : Promise.resolve(null),
    );
  });

  afterAll(() => app.close());

  it('login pose le cookie de refresh, refresh le renouvelle, logout l’efface', async () => {
    const server = app.getHttpServer();

    const login = await request(server)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'motdepasse123' })
      .expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.refreshToken).toBeUndefined();

    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toMatch(/refreshToken=.+; Path=\/auth; .*HttpOnly/);

    const refreshed = await request(server)
      .post('/auth/refresh')
      .set('Cookie', cookies[0].split(';')[0])
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    const logout = await request(server).post('/auth/logout').expect(200);
    expect((logout.headers['set-cookie'] as unknown as string[])[0]).toMatch(/refreshToken=;/);
  });

  it('refresh sans cookie répond 401', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(401);
  });

  it('login avec un mauvais mot de passe répond 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'mauvais' })
      .expect(401);
  });
});
