import { Global, INestApplication, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth.module.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: { user: { findUnique: vi.fn() } } }],
  exports: [PrismaService],
})
class PrismaStubModule {}

describe('GET /auth/me (guard)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaStubModule, AuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());

  it('401 sans token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('401 avec un token invalide', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer n-importe-quoi')
      .expect(401);
  });

  it('401 avec un refresh token utilisé comme access token', async () => {
    const refresh = jwt.sign(
      { sub: '1', tokenType: 'refresh' },
      { secret: 'test-refresh-secret' },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${refresh}`)
      .expect(401);
  });

  it('200 avec un access token valide', async () => {
    const access = jwt.sign({ sub: '1', tokenType: 'access' });
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
   expect(res.body).toEqual({ userId: '1' });
  });
});