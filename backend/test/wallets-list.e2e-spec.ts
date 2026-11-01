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

type Section = 'open' | 'closed' | 'invitations';

describe('Wallet listing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = randomUUID();
  const emailPrefix = `wallets-list-${runId}`;
  // Identifiants déterministes : ils permettent de fixer le critère secondaire de tri.
  const id = (key: string) => `${runId}-${key}`;
  const at = (iso: string) => new Date(iso);

  let alice: TestUser;
  let bob: TestUser;
  let nobody: TestUser;

  async function registerAndLogin(label: string): Promise<TestUser> {
    const credentials = {
      email: `${emailPrefix}-${label}@example.com`,
      password: 'motdepasse123',
    };
    const registration = await request(app.getHttpServer())
      .post('/users')
      .send({ ...credentials, name: label })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    return { id: registration.body.id, token: login.body.accessToken };
  }

  async function seedWallet(
    key: string,
    createdById: string,
    createdAt: string,
    status: 'OPEN' | 'CLOSED' = 'OPEN',
    updatedAt = createdAt,
  ) {
    await prisma.wallet.create({
      data: {
        id: id(key),
        title: `Wallet ${key}`,
        description: `Description de ${key}`,
        status,
        createdById,
        createdAt: at(createdAt),
        updatedAt: at(updatedAt),
        closedAt: status === 'CLOSED' ? at(createdAt) : null,
      },
    });
  }

  async function seedMembership(
    walletKey: string,
    userId: string,
    status: 'MEMBER' | 'INVITED',
    invitedAt: string,
    membershipKey = `m-${walletKey}-${userId}`,
  ) {
    await prisma.walletMember.create({
      data: {
        id: id(membershipKey),
        walletId: id(walletKey),
        userId,
        status,
        invitedAt: at(invitedAt),
        acceptedAt: status === 'MEMBER' ? at(invitedAt) : null,
      },
    });
  }

  function list(user: TestUser, query: Record<string, string> = {}) {
    return request(app.getHttpServer())
      .get('/wallets')
      .query(query)
      .set('Authorization', `Bearer ${user.token}`);
  }

  const ids = (section: { items: { id: string }[] }) =>
    section.items.map((item) => item.id);

  // Parcourt une section page par page avec le seul curseur de cette section.
  async function collect(user: TestUser, section: Section, limit: number) {
    const cursorParam = `${section}Cursor`;
    const collected: string[] = [];
    let cursor: string | null = null;

    do {
      // Annotation nécessaire : `cursor` dépend de `response` qui dépend de `cursor` (TS7022).
      const response: request.Response = await list(user, {
        limit: String(limit),
        ...(cursor ? { [cursorParam]: cursor } : {}),
      }).expect(200);
      collected.push(...ids(response.body[section]));
      cursor = response.body[section].nextCursor;
    } while (cursor);

    return collected;
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

    alice = await registerAndLogin('alice');
    bob = await registerAndLogin('bob');
    nobody = await registerAndLogin('nobody');

    // Alice est membre de 5 porte-monnaies ouverts (o4a et o4b ont la même date) et de 3 clos.
    // "o1" a été créé par Bob : Alice y est simple membre ; "o4b" a été mis à jour après sa création.
    await seedWallet('o1', bob.id, '2026-01-01T10:00:00.000Z');
    await seedWallet('o2', alice.id, '2026-01-02T10:00:00.000Z');
    await seedWallet('o3', alice.id, '2026-01-03T10:00:00.000Z');
    await seedWallet('o4a', alice.id, '2026-01-04T10:00:00.000Z');
    await seedWallet(
      'o4b',
      alice.id,
      '2026-01-04T10:00:00.000Z',
      'OPEN',
      '2026-01-10T10:00:00.000Z',
    );
    await seedWallet('c1', alice.id, '2026-02-01T10:00:00.000Z', 'CLOSED');
    await seedWallet('c2', alice.id, '2026-02-02T10:00:00.000Z', 'CLOSED');
    await seedWallet('c3', alice.id, '2026-02-03T10:00:00.000Z', 'CLOSED');
    for (const key of ['o1', 'o2', 'o3', 'o4a', 'o4b', 'c1', 'c2', 'c3']) {
      await seedMembership(key, alice.id, 'MEMBER', '2026-01-01T00:00:00.000Z');
    }

    // Bob possède un porte-monnaie qu'Alice ne doit pas voir ("ob"), puis invite Alice à quatre porte-monnaies
    // ouverts (dates de création à l'inverse des dates d'invitation) et à un porte-monnaie clos.
    await seedWallet('ob', bob.id, '2026-04-01T10:00:00.000Z');
    await seedWallet('wi1', bob.id, '2026-06-03T10:00:00.000Z');
    await seedWallet('wi2', bob.id, '2026-06-02T10:00:00.000Z');
    await seedWallet('wi3', bob.id, '2026-06-01T10:00:00.000Z');
    await seedWallet('wi4', bob.id, '2026-06-01T10:00:00.000Z');
    await seedWallet('wic', bob.id, '2026-05-01T10:00:00.000Z', 'CLOSED');
    for (const key of ['o1', 'ob', 'wi1', 'wi2', 'wi3', 'wi4', 'wic']) {
      await seedMembership(key, bob.id, 'MEMBER', '2026-01-01T00:00:00.000Z');
    }
    await seedMembership(
      'wi1',
      alice.id,
      'INVITED',
      '2026-03-01T10:00:00.000Z',
    );
    await seedMembership(
      'wi2',
      alice.id,
      'INVITED',
      '2026-03-02T10:00:00.000Z',
    );
    await seedMembership(
      'wi3',
      alice.id,
      'INVITED',
      '2026-03-03T10:00:00.000Z',
    );
    await seedMembership(
      'wi4',
      alice.id,
      'INVITED',
      '2026-03-03T10:00:00.000Z',
    );
    await seedMembership(
      'wic',
      alice.id,
      'INVITED',
      '2026-03-04T10:00:00.000Z',
    );
  });

  describe('authentication', () => {
    it('rejects a request without token with HTTP 401', async () => {
      await request(app.getHttpServer()).get('/wallets').expect(401);
    });

    it('rejects an invalid token with HTTP 401', async () => {
      await request(app.getHttpServer())
        .get('/wallets')
        .set('Authorization', 'Bearer not-a-valid-token')
        .expect(401);
    });
  });

  describe('sections', () => {
    it('returns three empty sections for a user with no wallet', async () => {
      const response = await list(nobody).expect(200);

      expect(response.body).toEqual({
        open: { items: [], nextCursor: null, total: 0 },
        closed: { items: [], nextCursor: null, total: 0 },
        invitations: { items: [], nextCursor: null, total: 0 },
      });
    });

    it('separates open wallets, closed wallets and invitations to open wallets', async () => {
      const { body } = await list(alice).expect(200);

      // Triés par date de création décroissante, puis par identifiant décroissant (o4b avant o4a).
      expect(ids(body.open)).toEqual(['o4b', 'o4a', 'o3', 'o2', 'o1'].map(id));
      expect(ids(body.closed)).toEqual(['c3', 'c2', 'c1'].map(id));
      // Triées par date d'invitation décroissante (et non par date du porte-monnaie), puis par identifiant d'adhésion.
      // L'invitation vers le porte-monnaie clos "wic" n'est pas retournée.
      expect(ids(body.invitations)).toEqual(
        ['wi4', 'wi3', 'wi2', 'wi1'].map(id),
      );
      expect(
        body.open.items.every(
          (item: { status: string }) => item.status === 'OPEN',
        ),
      ).toBe(true);
      expect(
        body.closed.items.every(
          (item: { status: string }) => item.status === 'CLOSED',
        ),
      ).toBe(true);
      expect([
        body.open.nextCursor,
        body.closed.nextCursor,
        body.invitations.nextCursor,
      ]).toEqual([null, null, null]);
    });

    it('exposes only the fields needed by the interface', async () => {
      const { body } = await list(alice).expect(200);
      const walletFields = [
        'closedAt',
        'createdAt',
        'creatorName',
        'description',
        'id',
        'isCreator',
        'status',
        'title',
        'updatedAt',
      ];

      expect(Object.keys(body).sort()).toEqual([
        'closed',
        'invitations',
        'open',
      ]);
      expect(Object.keys(body.open).sort()).toEqual([
        'items',
        'nextCursor',
        'total',
      ]);
      expect(Object.keys(body.open.items[0]).sort()).toEqual(walletFields);
      expect(Object.keys(body.closed.items[0]).sort()).toEqual(walletFields);
      expect(Object.keys(body.invitations.items[0]).sort()).toEqual(
        [...walletFields, 'invitationId', 'invitedAt'].sort(),
      );
      expect(body.invitations.items[0].invitationId).toEqual(
        expect.any(String),
      );
      expect(body.invitations.items[0].invitedAt).toBe(
        '2026-03-03T10:00:00.000Z',
      );
      expect(JSON.stringify(body)).not.toMatch(
        /password|token|createdById|userId|members|email/i,
      );
    });

    it('tells which wallets the caller created, and by whom', async () => {
      const { body } = await list(alice).expect(200);
      const byId = (key: string) =>
        body.open.items.find((item: { id: string }) => item.id === id(key));

      // Alice a créé o2, o3, o4a, o4b ; Bob a créé o1 (Alice n'y est que membre).
      expect(byId('o4b')).toMatchObject({
        isCreator: true,
        creatorName: 'alice',
      });
      expect(byId('o2')).toMatchObject({
        isCreator: true,
        creatorName: 'alice',
      });
      expect(byId('o1')).toMatchObject({
        isCreator: false,
        creatorName: 'bob',
      });
      // Une invitation vient toujours d'un porte-monnaie créé par quelqu'un d'autre.
      expect(body.invitations.items[0]).toMatchObject({
        isCreator: false,
        creatorName: 'bob',
      });
      // Le même porte-monnaie, vu par son créateur.
      return list(bob)
        .expect(200)
        .then(({ body: bobBody }) => {
          const o1 = bobBody.open.items.find(
            (item: { id: string }) => item.id === id('o1'),
          );
          expect(o1).toMatchObject({ isCreator: true, creatorName: 'bob' });
        });
    });

    it('exposes the last update of each wallet, which can differ from its creation', async () => {
      const { body } = await list(alice).expect(200);
      const o4b = body.open.items[0];

      expect(o4b.id).toBe(id('o4b'));
      expect(o4b.createdAt).toBe('2026-01-04T10:00:00.000Z');
      expect(o4b.updatedAt).toBe('2026-01-10T10:00:00.000Z');
      // Le tri reste fait sur la date de création, pas sur la dernière mise à jour.
      expect(ids(body.open)[0]).toBe(id('o4b'));
      expect(body.open.items[1].updatedAt).toBe(body.open.items[1].createdAt);
    });

    it('does not list an invited wallet as a joined one', async () => {
      const { body } = await list(alice).expect(200);

      expect(ids(body.open)).not.toContain(id('wi1'));
      expect(ids(body.closed)).not.toContain(id('wic'));
      expect(JSON.stringify(body)).not.toContain(id('wic'));
    });
  });

  describe('isolation between users', () => {
    it("returns only the wallets associated with the caller's own account", async () => {
      const { body } = await list(bob).expect(200);

      // "o1" est un porte-monnaie créé par Bob, dont Alice est aussi membre : Bob le voit, lui seul n'en voit pas d'autre d'Alice.
      expect(ids(body.open)).toEqual(
        ['wi1', 'wi2', 'wi4', 'wi3', 'ob', 'o1'].map(id),
      );
      expect(ids(body.closed)).toEqual([id('wic')]);
      expect(body.invitations).toEqual({
        items: [],
        nextCursor: null,
        total: 0,
      });

      const everything = JSON.stringify(body);
      for (const key of ['o2', 'o4a', 'o4b', 'c1', 'c3']) {
        expect(everything).not.toContain(id(key));
      }
    });

    it("does not leak Bob's wallet to Alice", async () => {
      const { body } = await list(alice).expect(200);

      expect(JSON.stringify(body)).not.toContain(id('ob'));
    });

    it('refuses a user identifier supplied by the client', async () => {
      await list(alice, { userId: bob.id }).expect(400);
    });
  });

  describe('totals', () => {
    it('counts every wallet of each section, whatever the limit and the cursors', async () => {
      const all = (await list(alice).expect(200)).body;
      expect([all.open.total, all.closed.total, all.invitations.total]).toEqual(
        [5, 3, 4],
      );

      const firstPage = (await list(alice, { limit: '2' }).expect(200)).body;
      const nextPage = (
        await list(alice, {
          limit: '2',
          openCursor: firstPage.open.nextCursor,
          invitationsCursor: firstPage.invitations.nextCursor,
        }).expect(200)
      ).body;
      for (const body of [firstPage, nextPage]) {
        expect([
          body.open.total,
          body.closed.total,
          body.invitations.total,
        ]).toEqual([5, 3, 4]);
      }
    });

    it("counts only the caller's own wallets", async () => {
      const { body } = await list(bob).expect(200);

      expect([
        body.open.total,
        body.closed.total,
        body.invitations.total,
      ]).toEqual([6, 1, 0]);
    });
  });

  describe('pagination', () => {
    it('paginates each section independently by cursor', async () => {
      const first = (await list(alice, { limit: '2' }).expect(200)).body;

      expect(ids(first.open)).toEqual(['o4b', 'o4a'].map(id));
      expect(ids(first.closed)).toEqual(['c3', 'c2'].map(id));
      expect(ids(first.invitations)).toEqual(['wi4', 'wi3'].map(id));
      expect(first.open.nextCursor).toEqual(expect.any(String));
      expect(first.closed.nextCursor).toEqual(expect.any(String));
      expect(first.invitations.nextCursor).toEqual(expect.any(String));

      // Avancer le curseur des porte-monnaies ouverts ne change pas les deux autres sections.
      const second = (
        await list(alice, {
          limit: '2',
          openCursor: first.open.nextCursor,
        }).expect(200)
      ).body;

      expect(ids(second.open)).toEqual(['o3', 'o2'].map(id));
      expect(second.closed).toEqual(first.closed);
      expect(second.invitations).toEqual(first.invitations);

      const third = (
        await list(alice, {
          limit: '2',
          openCursor: second.open.nextCursor,
        }).expect(200)
      ).body;

      expect(ids(third.open)).toEqual([id('o1')]);
      expect(third.open.nextCursor).toBeNull();
    });

    it.each([1, 2, 3])(
      'walks every section exactly once with a page size of %i',
      async (limit) => {
        await expect(collect(alice, 'open', limit)).resolves.toEqual(
          ['o4b', 'o4a', 'o3', 'o2', 'o1'].map(id),
        );
        await expect(collect(alice, 'closed', limit)).resolves.toEqual(
          ['c3', 'c2', 'c1'].map(id),
        );
        await expect(collect(alice, 'invitations', limit)).resolves.toEqual(
          ['wi4', 'wi3', 'wi2', 'wi1'].map(id),
        );
      },
    );

    it('applies a default limit of 20 and accepts a maximum of 100', async () => {
      const crowd = await registerAndLogin('crowd');
      const base = Date.parse('2026-07-01T00:00:00.000Z');
      const keys = Array.from({ length: 21 }, (_, index) => `crowd-${index}`);
      await prisma.wallet.createMany({
        data: keys.map((key, index) => ({
          id: id(key),
          title: `Wallet ${key}`,
          createdById: crowd.id,
          createdAt: new Date(base + index * 1000),
        })),
      });
      await prisma.walletMember.createMany({
        data: keys.map((key) => ({
          id: id(`m-${key}`),
          walletId: id(key),
          userId: crowd.id,
          status: 'MEMBER' as const,
          acceptedAt: new Date(base),
        })),
      });

      const byDefault = (await list(crowd).expect(200)).body;
      expect(byDefault.open.items).toHaveLength(20);
      expect(byDefault.open.total).toBe(21);
      expect(byDefault.open.nextCursor).toEqual(expect.any(String));

      const maximum = (await list(crowd, { limit: '100' }).expect(200)).body;
      expect(maximum.open.items).toHaveLength(21);
      expect(maximum.open.nextCursor).toBeNull();
    });

    it.each(['0', '101', '-1', '1.5', 'abc', ''])(
      'rejects limit=%s with HTTP 400',
      async (limit) => {
        await list(alice, { limit }).expect(400);
      },
    );

    it.each(['openCursor', 'closedCursor', 'invitationsCursor'])(
      'rejects an invalid %s with HTTP 400',
      async (name) => {
        await list(alice, { [name]: 'not-a-cursor' }).expect(400);
      },
    );
  });

  describe('relation with wallet creation', () => {
    it('lists a wallet created through POST /wallets as an open wallet of its creator', async () => {
      const creator = await registerAndLogin('creator');

      const created = await request(app.getHttpServer())
        .post('/wallets')
        .set('Authorization', `Bearer ${creator.token}`)
        .send({ title: 'Vacances' })
        .expect(201);
      const { body } = await list(creator).expect(200);

      expect(ids(body.open)).toEqual([created.body.id]);
      expect(body.closed.items).toEqual([]);
      expect(body.invitations.items).toEqual([]);
    });
  });

  describe('database index', () => {
    it('indexes WalletMember by user and status', async () => {
      const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'WalletMember'`;

      expect(
        indexes.some(({ indexdef }) => indexdef.includes('("userId", status)')),
      ).toBe(true);
    });
  });

  afterAll(async () => {
    try {
      // Les adhésions sont supprimées en cascade avec leur porte-monnaie ; les utilisateurs sont en onDelete: Restrict.
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
