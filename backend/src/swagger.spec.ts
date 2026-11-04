import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { isSwaggerEnabled, setupSwagger } from './swagger.js';

type Schema = {
  required?: string[];
  properties?: Record<string, Record<string, unknown>>;
};
type Parameter = { name: string; in: string; schema: Record<string, unknown> };
type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, { parameters?: Parameter[] }>>;
  components: { schemas: Record<string, Schema> };
};

// L'application complète, sans base de données : la documentation n'en a pas besoin.
async function createApp(withSwagger: boolean) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  const app = moduleRef.createNestApplication();
  if (withSwagger) setupSwagger(app);
  await app.init();
  return app;
}

describe('isSwaggerEnabled', () => {
  it.each([
    [{ SWAGGER_ENABLED: 'true' }, true],
    [{ SWAGGER_ENABLED: 'true', NODE_ENV: 'development' }, true],
    [{ SWAGGER_ENABLED: 'true', NODE_ENV: 'production' }, false],
    [{ SWAGGER_ENABLED: 'false' }, false],
    [{}, false],
  ])('%o => %s', (env, expected) => {
    expect(isSwaggerEnabled(env)).toBe(expected);
  });
});

describe('documentation Swagger', () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.stubEnv('JWT_REFRESH_SECRET', 'test-refresh-secret');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  it('sert l’interface et le document OpenAPI', async () => {
    app = await createApp(true);
    const server = app.getHttpServer();

    await request(server)
      .get('/api/docs')
      .expect(200)
      .expect('Content-Type', /html/);
    const { body } = await request(server).get('/api/docs-json').expect(200);
    expect((body as OpenApiDocument).openapi).toMatch(/^3\./);
  });

  it('documente toutes les routes de l’API', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');
    const { paths } = body as OpenApiDocument;
    const operations = Object.entries(paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(operations).toHaveLength(32);
    expect(operations).toEqual(
      expect.arrayContaining([
        'POST /auth/login',
        'PATCH /users/me',
        'GET /wallets/{id}',
        'GET /wallets/{walletId}/expenses',
        'PATCH /wallets/{walletId}/expenses/{id}',
        'POST /invitations/{id}/accept',
        'POST /wallets/{walletId}/repayments/{repaymentId}/confirm',
        'GET /wallets/{id}/balance',
        'GET /notifications',
        'POST /notifications/{id}/read',
        'GET /health',
      ]),
    );
  });

  it('décrit les champs des corps de requête', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');
    const { schemas } = (body as OpenApiDocument).components;

    expect(schemas.CreateExpenseDto.required).toEqual([
      'title',
      'amount',
      'date',
    ]);
    expect(schemas.CreateExpenseDto.properties).toMatchObject({
      title: { type: 'string', maxLength: 100 },
      amount: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
      date: { type: 'string', format: 'date' },
      paidById: { type: 'string', format: 'uuid' },
    });
    expect(schemas.UpdateExpenseDto.required ?? []).toEqual([]);
    expect(schemas.CreateUserDto.properties?.password).toMatchObject({
      minLength: 8,
      maxLength: 72,
    });
  });

  it('décrit les paramètres de pagination et de filtre', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');
    const { paths } = body as OpenApiDocument;
    const parameters =
      paths['/wallets/{walletId}/repayments'].get.parameters ?? [];
    const byName = Object.fromEntries(
      parameters.map((item) => [item.name, item]),
    );

    expect(byName.walletId).toMatchObject({ in: 'path' });
    expect(byName.limit).toMatchObject({
      in: 'query',
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    });
    expect(byName.cursor).toMatchObject({ in: 'query' });
    expect(byName.status.schema).toEqual({
      $ref: '#/components/schemas/RepaymentStatus',
    });
    expect(
      (body as OpenApiDocument).components.schemas.RepaymentStatus,
    ).toMatchObject({ enum: ['PENDING', 'PAID', 'CANCELLED'] });
  });

  it('n’expose rien quand la documentation est désactivée', async () => {
    app = await createApp(false);
    await request(app.getHttpServer()).get('/api/docs').expect(404);
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
  });
});
