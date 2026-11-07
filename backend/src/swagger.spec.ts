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
type Operation = {
  summary?: string;
  tags?: string[];
  security?: Record<string, string[]>[];
  parameters?: Parameter[];
  responses: Record<string, { description: string; content?: unknown }>;
};
type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

const PUBLIC_ROUTES = [
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /users',
  'GET /health',
];

function operationsOf(document: OpenApiDocument) {
  return Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({
      route: `${method.toUpperCase()} ${path}`,
      operation,
    })),
  );
}

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

  it('range chaque route dans un tag', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');
    const tags = new Set(
      operationsOf(body as OpenApiDocument).flatMap(
        ({ operation }) => operation.tags ?? [],
      ),
    );

    expect([...tags].sort()).toEqual([
      'auth',
      'closure',
      'expenses',
      'health',
      'invitations',
      'members',
      'notifications',
      'repayments',
      'users',
      'wallets',
    ]);
    for (const { route, operation } of operationsOf(body as OpenApiDocument)) {
      expect(operation.tags, route).toHaveLength(1);
    }
  });

  it('exige le jeton Bearer sur les routes protégées uniquement', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');

    for (const { route, operation } of operationsOf(body as OpenApiDocument)) {
      const bearer = (operation.security ?? []).some(
        (item) => 'bearer' in item,
      );
      expect(bearer, route).toBe(!PUBLIC_ROUTES.includes(route));
      if (bearer) expect(operation.responses['401'], route).toBeDefined();
    }
    const refresh = (body as OpenApiDocument).paths['/auth/refresh'].post;
    expect(refresh.security).toEqual([{ cookie: [] }]);
  });

  it('résume chaque route et décrit sa réponse en cas de succès', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');

    for (const { route, operation } of operationsOf(body as OpenApiDocument)) {
      expect(operation.summary, route).toBeTruthy();
      const success = Object.keys(operation.responses).filter((code) =>
        code.startsWith('2'),
      );
      expect(success, route).toHaveLength(1);
      if (success[0] !== '204') {
        expect(operation.responses[success[0]].content, route).toBeDefined();
      }
    }
  });

  it('documente les champs renvoyés par GET /auth/me', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');
    const document = body as OpenApiDocument;
    const currentUser = document.paths['/auth/me'].get;

    expect(JSON.stringify(currentUser.responses['200'].content)).toContain(
      '#/components/schemas/CurrentUserResponseDto',
    );
    expect(document.components.schemas.CurrentUserResponseDto.required).toEqual(
      ['userId', 'email', 'name'],
    );
    expect(
      document.components.schemas.CurrentUserResponseDto.properties,
    ).toMatchObject({
      userId: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email', example: 'alice@example.com' },
      name: { type: 'string', example: 'Alice Martin' },
    });
  });

  it('décrit les réponses et les erreurs de la modification d’une dépense', async () => {
    app = await createApp(true);
    const { body } = await request(app.getHttpServer()).get('/api/docs-json');
    const document = body as OpenApiDocument;
    const update = document.paths['/wallets/{walletId}/expenses/{id}'].patch;

    expect(Object.keys(update.responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
    ]);
    expect(JSON.stringify(update.responses['200'].content)).toContain(
      '#/components/schemas/ExpenseResponseDto',
    );
    expect(JSON.stringify(update.responses['409'].content)).toContain(
      '#/components/schemas/ErrorResponseDto',
    );
    expect(update.responses['403'].content).toMatchObject({
      'application/json': {
        example: {
          statusCode: 403,
          message: 'Seul le payeur peut modifier cette dépense.',
          error: 'Forbidden',
        },
      },
    });
    expect(document.components.schemas.ExpensePageDto.properties).toMatchObject(
      {
        totalAmount: { type: 'integer' },
        nextCursor: { type: 'string', nullable: true },
      },
    );
  });

  it('n’expose rien quand la documentation est désactivée', async () => {
    app = await createApp(false);
    await request(app.getHttpServer()).get('/api/docs').expect(404);
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
  });
});
