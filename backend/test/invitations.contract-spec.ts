import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { User, Wallet } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createInvitationFixtures,
  getInvitationTestDatabaseUrl,
} from './support/invitations.fixtures.js';

interface InvitationPage {
  data: {
    id: string;
    invitedAt: string;
    wallet: {
      id: string;
      title: string;
      description: string | null;
      status: 'OPEN' | 'CLOSED';
    };
  }[];
  nextCursor: string | null;
}

const ACCESS_SECRET = 'if13-local-access-secret';
const REFRESH_SECRET = 'if13-local-refresh-secret';
const PASSWORD = 'if13-fixture-password';

describe('IF-13 — contrat HTTP des invitations (UC04 et UC05)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let fixtures: ReturnType<typeof createInvitationFixtures> | undefined;
  let creator: User;
  let invitee: User;
  let otherUser: User;
  let wallet: Wallet;
  let passwordHash: string;
  const jwt = new JwtService({ secret: ACCESS_SECRET });
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  };

  function server() {
    if (!app) throw new Error('Application de test non initialisée.');
    return app.getHttpServer();
  }

  function authorization(user: User) {
    return `Bearer ${jwt.sign({ sub: user.id, tokenType: 'access' }, { expiresIn: '5m' })}`;
  }

  function testFixtures() {
    if (!fixtures) throw new Error('Données de test non initialisées.');
    return fixtures;
  }

  function findMembership(userId = invitee.id) {
    return prisma.walletMember.findUnique({
      where: { walletId_userId: { walletId: wallet.id, userId } },
    });
  }

  function sendInvitation(body: object = { email: invitee.email }) {
    return request(server())
      .post(`/wallets/${wallet.id}/invitations`)
      .set('Authorization', authorization(creator))
      .send(body);
  }

  function listInvitations(user = invitee, query: object = {}) {
    return request(server())
      .get('/invitations')
      .set('Authorization', authorization(user))
      .query(query);
  }

  function acceptInvitation(id: string, user = invitee) {
    return request(server())
      .post(`/invitations/${id}/accept`)
      .set('Authorization', authorization(user));
  }

  function declineInvitation(id: string, user = invitee) {
    return request(server())
      .post(`/invitations/${id}/decline`)
      .set('Authorization', authorization(user));
  }

  function withdrawInvitation(
    invitationId: string,
    walletId = wallet.id,
    user = creator,
  ) {
    return request(server())
      .delete(`/wallets/${walletId}/invitations/${invitationId}`)
      .set('Authorization', authorization(user));
  }

  function expectNoSecrets(body: unknown) {
    if (Array.isArray(body)) {
      body.forEach(expectNoSecrets);
    } else if (body !== null && typeof body === 'object') {
      for (const [key, value] of Object.entries(body)) {
        expect(key).not.toMatch(/password|hash|secret|token/i);
        expectNoSecrets(value);
      }
    }
    if (typeof body === 'string') {
      expect(body).not.toContain(PASSWORD);
      expect(body).not.toContain(passwordHash);
      expect(body).not.toContain(ACCESS_SECRET);
      expect(body).not.toContain(REFRESH_SECRET);
    }
  }

  function readPage(body: unknown): InvitationPage {
    expectNoSecrets(body);
    expect(body).toEqual({
      data: expect.any(Array),
      nextCursor: expect.any(String),
    });
    return body as InvitationPage;
  }

  function expectLastPage(body: unknown): InvitationPage {
    expectNoSecrets(body);
    expect(body).toEqual({ data: expect.any(Array), nextCursor: null });
    return body as InvitationPage;
  }

  beforeAll(async () => {
    // Refuser une URL partagée avant d'importer AppModule ou de connecter Prisma.
    const databaseUrl = getInvitationTestDatabaseUrl();
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_URL_UNPOOLED = databaseUrl;
    process.env.JWT_SECRET = ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;

    const { AppModule } = await import('../src/app.module.js');
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
    passwordHash = await hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    fixtures = createInvitationFixtures(prisma);
    creator = await fixtures.createUser('Alice', passwordHash);
    invitee = await fixtures.createUser('Bob', passwordHash);
    otherUser = await fixtures.createUser('Chloé', passwordHash);
    wallet = await fixtures.createWallet(creator.id);
  });

  afterEach(async () => {
    await fixtures?.cleanup();
    fixtures = undefined;
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  describe('Authentification JWT', () => {
    it('vérifie le JWT de préparation avec la vraie stratégie IF-11', async () => {
      const response = await request(server())
        .get('/auth/me')
        .set('Authorization', authorization(invitee))
        .expect(200);

      expect(response.body).toEqual({ userId: invitee.id });
    });

    it.each(['create', 'list', 'accept', 'decline', 'withdraw'] as const)(
      'refuse la route %s sans authentification (401)',
      async (operation) => {
        const invitation = await testFixtures().createMembership(
          wallet.id,
          invitee.id,
        );
        const paths = {
          create: `/wallets/${wallet.id}/invitations`,
          list: '/invitations',
          accept: `/invitations/${invitation.id}/accept`,
          decline: `/invitations/${invitation.id}/decline`,
          withdraw: `/wallets/${wallet.id}/invitations/${invitation.id}`,
        };
        const response = await (operation === 'list'
          ? request(server()).get(paths.list)
          : operation === 'withdraw'
            ? request(server()).delete(paths.withdraw)
            : request(server())
                .post(paths[operation])
                .send(
                  operation === 'create'
                    ? { email: otherUser.email }
                    : undefined,
                ));

        expect(response.status).toBe(401);
        expectNoSecrets(response.body);
        expect(await findMembership()).toEqual(invitation);
        expect(await findMembership(otherUser.id)).toBeNull();
      },
    );

    it.each(['invalid', 'expired', 'refresh'] as const)(
      'refuse un jeton %s sur les trois routes (401)',
      async (tokenType) => {
        const invitation = await testFixtures().createMembership(
          wallet.id,
          invitee.id,
        );
        const tokens = {
          invalid: 'jeton-invalide',
          expired: jwt.sign(
            { sub: invitee.id, tokenType: 'access' },
            { expiresIn: -1 },
          ),
          // Même signature qu'un access token : le type doit aussi être vérifié.
          refresh: jwt.sign({ sub: invitee.id, tokenType: 'refresh' }),
        };
        const header = `Bearer ${tokens[tokenType]}`;
        const responses = await Promise.all([
          request(server())
            .post(`/wallets/${wallet.id}/invitations`)
            .set('Authorization', header)
            .send({ email: otherUser.email }),
          request(server()).get('/invitations').set('Authorization', header),
          request(server())
            .post(`/invitations/${invitation.id}/accept`)
            .set('Authorization', header),
          request(server())
            .post(`/invitations/${invitation.id}/decline`)
            .set('Authorization', header),
          request(server())
            .delete(`/wallets/${wallet.id}/invitations/${invitation.id}`)
            .set('Authorization', header),
        ]);

        for (const response of responses) {
          expect(response.status).toBe(401);
          expectNoSecrets(response.body);
        }
        expect(await findMembership()).toEqual(invitation);
        expect(await findMembership(otherUser.id)).toBeNull();
      },
    );
  });

  describe('POST /wallets/:walletId/invitations', () => {
    it('crée une adhésion INVITED pour un compte existant (201)', async () => {
      const oldUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { updatedAt: oldUpdatedAt },
      });

      const response = await sendInvitation().expect(201);

      expectNoSecrets(response.body);
      expect(
        (
          await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
        ).updatedAt.getTime(),
      ).toBeGreaterThan(oldUpdatedAt.getTime());
      expect(await findMembership()).toMatchObject({
        id: expect.any(String),
        userId: invitee.id,
        walletId: wallet.id,
        status: 'INVITED',
        invitedAt: expect.any(Date),
        acceptedAt: null,
      });
      expect(await findMembership(creator.id)).toMatchObject({
        status: 'MEMBER',
      });
      expect(
        await prisma.walletMember.count({ where: { walletId: wallet.id } }),
      ).toBe(2);
    });

    it.each([
      ['email absent', {}],
      ['email vide', { email: '' }],
      ['email invalide', { email: 'sans-arobase' }],
      ['email null', { email: null }],
      ['email numérique', { email: 123 }],
      ['email sous forme de tableau', { email: ['bob@example.com'] }],
    ])('refuse un corps avec %s (400)', async (_case, body) => {
      const response = await sendInvitation(body).expect(400);

      expectNoSecrets(response.body);
      expect(await findMembership()).toBeNull();
      expect(
        await prisma.walletMember.count({ where: { walletId: wallet.id } }),
      ).toBe(1);
    });

    it.each(['userId', 'createdById', 'inviterId', 'status', 'invitedAt'])(
      'rejette la propriété client non prévue %s (400)',
      async (property) => {
        await sendInvitation({
          email: invitee.email,
          [property]: creator.id,
        }).expect(400);
        expect(await findMembership()).toBeNull();
      },
    );

    it.each(['stranger', 'INVITED', 'MEMBER'] as const)(
      'refuse un non-créateur au rôle %s (403)',
      async (role) => {
        if (role !== 'stranger') {
          await testFixtures().createMembership(wallet.id, otherUser.id, {
            status: role,
            acceptedAt: role === 'MEMBER' ? new Date() : null,
          });
        }

        await request(server())
          .post(`/wallets/${wallet.id}/invitations`)
          .set('Authorization', authorization(otherUser))
          .send({ email: invitee.email })
          .expect(403);
        expect(await findMembership()).toBeNull();
      },
    );

    it('refuse un portefeuille inexistant (404)', async () => {
      await request(server())
        .post(`/wallets/${randomUUID()}/invitations`)
        .set('Authorization', authorization(creator))
        .send({ email: invitee.email })
        .expect(404);
      expect(await findMembership()).toBeNull();
    });

    it('refuse un compte inexistant sans créer de compte (404)', async () => {
      const email = `${randomUUID()}@example.com`;
      await sendInvitation({ email }).expect(404);

      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      expect(
        await prisma.walletMember.count({ where: { walletId: wallet.id } }),
      ).toBe(1);
    });

    it('refuse une auto-invitation sans modifier le créateur (400)', async () => {
      const membership = await findMembership(creator.id);
      await sendInvitation({ email: creator.email }).expect(400);
      expect(await findMembership(creator.id)).toEqual(membership);
    });

    it('refuse une invitation dans un portefeuille fermé (409)', async () => {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      await sendInvitation().expect(409);
      expect(await findMembership()).toBeNull();
    });

    it.each(['INVITED', 'MEMBER'] as const)(
      'refuse une adhésion déjà au statut %s sans la modifier (409)',
      async (status) => {
        const existing = await testFixtures().createMembership(
          wallet.id,
          invitee.id,
          {
            status,
            acceptedAt: status === 'MEMBER' ? new Date() : null,
          },
        );
        await sendInvitation().expect(409);
        expect(await findMembership()).toEqual(existing);
      },
    );

    it('ne crée qu’une adhésion pour deux invitations simultanées (201 et 409)', async () => {
      const responses = await Promise.all([sendInvitation(), sendInvitation()]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      expect(
        await prisma.walletMember.count({
          where: { walletId: wallet.id, userId: invitee.id },
        }),
      ).toBe(1);
      expect(await findMembership()).toMatchObject({
        status: 'INVITED',
        acceptedAt: null,
      });
    });
  });

  describe('GET /invitations', () => {
    it('retourne une page vide si aucune invitation n’est en attente', async () => {
      const response = await listInvitations().expect(200);
      expect(response.body).toEqual({ data: [], nextCursor: null });
    });

    it('retourne uniquement les invitations INVITED du destinataire et les champs publics', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      await testFixtures().createMembership(wallet.id, otherUser.id);
      const joinedWallet = await testFixtures().createWallet(creator.id);
      await testFixtures().createMembership(joinedWallet.id, invitee.id, {
        status: 'MEMBER',
        acceptedAt: new Date(),
      });

      const response = await listInvitations().expect(200);
      const page = expectLastPage(response.body);
      expect(page.data).toEqual([
        {
          id: invitation.id,
          invitedAt: invitation.invitedAt.toISOString(),
          wallet: {
            id: wallet.id,
            title: wallet.title,
            description: wallet.description,
            status: 'OPEN',
          },
        },
      ]);
    });

    it('exclut une invitation INVITED après la clôture du portefeuille', async () => {
      await testFixtures().createMembership(wallet.id, invitee.id);
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      const response = await listInvitations().expect(200);
      const page = expectLastPage(response.body);
      expect(page.data).toEqual([]);
    });

    it('n’utilise jamais un userId fourni par le client pour changer le destinataire', async () => {
      const own = await testFixtures().createMembership(wallet.id, invitee.id);
      await testFixtures().createMembership(wallet.id, otherUser.id);

      const response = await listInvitations(invitee, { userId: otherUser.id });
      // Refuser ce paramètre ou l'ignorer est sûr ; le prendre comme identité ne l'est pas.
      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(
          expectLastPage(response.body).data.map((item) => item.id),
        ).toEqual([own.id]);
      }
    });

    it('utilise une limite de 20 et permet de lire la suite sans doublon', async () => {
      const invitations = await testFixtures().createInvitations(
        creator.id,
        invitee.id,
        25,
      );
      await testFixtures().createInvitations(creator.id, otherUser.id, 25);
      const first = readPage((await listInvitations().expect(200)).body);

      expect(first.data.map((item) => item.id)).toEqual(
        invitations.slice(0, 20).map((item) => item.id),
      );
      expect(first.nextCursor).toEqual(expect.any(String));
      expect(first.nextCursor).not.toBe('');

      const second = expectLastPage(
        (
          await listInvitations(invitee, {
            cursor: first.nextCursor,
          }).expect(200)
        ).body,
      );
      expect(second.data.map((item) => item.id)).toEqual(
        invitations.slice(20).map((item) => item.id),
      );
    });

    it('départage les dates identiques par id décroissant entre deux pages', async () => {
      const invitations = await testFixtures().createInvitations(
        creator.id,
        invitee.id,
        5,
        true,
      );
      const first = readPage(
        (await listInvitations(invitee, { limit: 2 }).expect(200)).body,
      );
      const second = readPage(
        (
          await listInvitations(invitee, {
            limit: 2,
            cursor: first.nextCursor,
          }).expect(200)
        ).body,
      );
      const third = expectLastPage(
        (
          await listInvitations(invitee, {
            limit: 2,
            cursor: second.nextCursor,
          }).expect(200)
        ).body,
      );

      expect(
        [...first.data, ...second.data, ...third.data].map((item) => item.id),
      ).toEqual(invitations.map((item) => item.id));
      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(2);
      expect(third.data).toHaveLength(1);
    });

    it('respecte la limite maximale de 100', async () => {
      const invitations = await testFixtures().createInvitations(
        creator.id,
        invitee.id,
        101,
      );
      const page = readPage(
        (await listInvitations(invitee, { limit: 100 }).expect(200)).body,
      );

      expect(page.data.map((item) => item.id)).toEqual(
        invitations.slice(0, 100).map((item) => item.id),
      );
      expect(page.nextCursor).toEqual(expect.any(String));
      const last = expectLastPage(
        (
          await listInvitations(invitee, {
            limit: 100,
            cursor: page.nextCursor,
          }).expect(200)
        ).body,
      );
      expect(last.data.map((item) => item.id)).toEqual([invitations[100].id]);
    });

    it('ne fournit pas de curseur supplémentaire quand la page est exactement pleine', async () => {
      await testFixtures().createInvitations(creator.id, invitee.id, 2);
      const page = expectLastPage(
        (await listInvitations(invitee, { limit: 2 }).expect(200)).body,
      );
      expect(page.data).toHaveLength(2);
    });

    it('continue la pagination si l’invitation du curseur a été acceptée entre-temps', async () => {
      const invitations = await testFixtures().createInvitations(
        creator.id,
        invitee.id,
        4,
      );
      const first = readPage(
        (await listInvitations(invitee, { limit: 2 }).expect(200)).body,
      );
      await prisma.walletMember.update({
        where: { id: first.data[1].id },
        data: { status: 'MEMBER', acceptedAt: new Date() },
      });

      const second = expectLastPage(
        (
          await listInvitations(invitee, {
            limit: 2,
            cursor: first.nextCursor,
          }).expect(200)
        ).body,
      );
      expect(second.data.map((item) => item.id)).toEqual(
        invitations.slice(2).map((item) => item.id),
      );
    });

    it.each(['0', '-1', '101', '1.5', 'abc', ''])(
      'rejette la limite invalide "%s" (400)',
      async (limit) => {
        await listInvitations(invitee, { limit }).expect(400);
      },
    );

    it('rejette un curseur mal formé (400)', async () => {
      await listInvitations(invitee, {
        cursor: '***curseur-invalide***',
      }).expect(400);
    });
  });

  describe('POST /invitations/:id/accept', () => {
    it('transforme l’adhésion existante en MEMBER et renseigne acceptedAt (200)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const oldUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { updatedAt: oldUpdatedAt },
      });

      const response = await acceptInvitation(invitation.id).expect(200);

      expectNoSecrets(response.body);
      expect(
        (
          await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
        ).updatedAt.getTime(),
      ).toBeGreaterThan(oldUpdatedAt.getTime());
      const accepted = await findMembership();
      expect(accepted).toEqual({
        ...invitation,
        status: 'MEMBER',
        acceptedAt: expect.any(Date),
      });
      expect(accepted?.acceptedAt?.getTime()).toBeGreaterThanOrEqual(
        invitation.invitedAt.getTime(),
      );
      expect(
        await prisma.walletMember.count({
          where: { walletId: wallet.id, userId: invitee.id },
        }),
      ).toBe(1);
    });

    it('retire l’invitation acceptée de la liste des invitations reçues', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      await acceptInvitation(invitation.id).expect(200);

      const response = await listInvitations().expect(200);
      expect(response.body).toEqual({ data: [], nextCursor: null });
    });

    it.each(['creator', 'otherUser'] as const)(
      'refuse l’acceptation par %s sans modifier l’invitation (403)',
      async (actor) => {
        const invitation = await testFixtures().createMembership(
          wallet.id,
          invitee.id,
        );
        const response = await acceptInvitation(
          invitation.id,
          actor === 'creator' ? creator : otherUser,
        ).expect(403);

        expectNoSecrets(response.body);
        expect(await findMembership()).toEqual(invitation);
      },
    );

    it('ne permet pas d’usurper le destinataire avec un userId dans le corps', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const response = await acceptInvitation(invitation.id, otherUser).send({
        userId: invitee.id,
      });

      expect([400, 403]).toContain(response.status);
      expect(await findMembership()).toEqual(invitation);
    });

    it('refuse une invitation inexistante (404)', async () => {
      await acceptInvitation(randomUUID()).expect(404);
      expect(await findMembership()).toBeNull();
    });

    it('refuse une invitation déjà acceptée en conservant acceptedAt (409)', async () => {
      const membership = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
        {
          status: 'MEMBER',
          acceptedAt: new Date(),
        },
      );

      await acceptInvitation(membership.id).expect(409);
      expect(await findMembership()).toEqual(membership);
    });

    it('refuse un deuxième appel après une première acceptation réussie (409)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      await acceptInvitation(invitation.id).expect(200);
      const accepted = await findMembership();

      await acceptInvitation(invitation.id).expect(409);
      expect(await findMembership()).toEqual(accepted);
    });

    it('refuse un portefeuille fermé après l’envoi et laisse l’adhésion INVITED (409)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      await acceptInvitation(invitation.id).expect(409);
      expect(await findMembership()).toEqual(invitation);
    });

    it('n’accepte qu’une fois deux requêtes simultanées (200 et 409)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const responses = await Promise.all([
        acceptInvitation(invitation.id),
        acceptInvitation(invitation.id),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(await findMembership()).toMatchObject({
        id: invitation.id,
        status: 'MEMBER',
        acceptedAt: expect.any(Date),
      });
    });

    it('bloque un tiers même pendant l’acceptation par le destinataire (200 et 403)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const [recipientResponse, outsiderResponse] = await Promise.all([
        acceptInvitation(invitation.id),
        acceptInvitation(invitation.id, otherUser),
      ]);

      expect(recipientResponse.status).toBe(200);
      expect(outsiderResponse.status).toBe(403);
      expect(await findMembership()).toMatchObject({
        userId: invitee.id,
        status: 'MEMBER',
      });
      expect(await findMembership(otherUser.id)).toBeNull();
    });
  });

  describe('POST /invitations/:id/decline', () => {
    it('supprime l’invitation du destinataire et met à jour updatedAt (204)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const oldUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { updatedAt: oldUpdatedAt },
      });

      await declineInvitation(invitation.id).expect(204);

      expect(await findMembership()).toBeNull();
      expect(
        (
          await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
        ).updatedAt.getTime(),
      ).toBeGreaterThan(oldUpdatedAt.getTime());
      expect(await findMembership(creator.id)).toMatchObject({
        status: 'MEMBER',
      });
    });

    it.each(['creator', 'otherUser'] as const)(
      'refuse le refus par %s sans modifier l’invitation (403)',
      async (actor) => {
        const invitation = await testFixtures().createMembership(
          wallet.id,
          invitee.id,
        );

        await declineInvitation(
          invitation.id,
          actor === 'creator' ? creator : otherUser,
        ).expect(403);

        expect(await findMembership()).toEqual(invitation);
      },
    );

    it('refuse une invitation déjà acceptée sans supprimer le membre (409)', async () => {
      const membership = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
        { status: 'MEMBER', acceptedAt: new Date() },
      );

      await declineInvitation(membership.id).expect(409);

      expect(await findMembership()).toEqual(membership);
    });

    it('refuse une invitation existante sur un portefeuille fermé (409)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      await declineInvitation(invitation.id).expect(409);

      expect(await findMembership()).toEqual(invitation);
    });

    it('refuse une invitation supprimée par la clôture (404)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      await request(server())
        .post(`/wallets/${wallet.id}/close`)
        .set('Authorization', authorization(creator))
        .expect(200);

      await declineInvitation(invitation.id).expect(404);
      expect(await findMembership()).toBeNull();
      expect(await findMembership(creator.id)).toMatchObject({
        status: 'MEMBER',
      });
    });

    it('ne réussit pas simultanément avec l’acceptation', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const responses = await Promise.all([
        acceptInvitation(invitation.id),
        declineInvitation(invitation.id),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(await findMembership()).toMatchObject({
        id: invitation.id,
        status: 'MEMBER',
      });
    });
  });

  describe('DELETE /wallets/:walletId/invitations/:id', () => {
    it('supprime l’invitation du créateur et met à jour updatedAt (204)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const oldUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { updatedAt: oldUpdatedAt },
      });

      await withdrawInvitation(invitation.id).expect(204);

      expect(await findMembership()).toBeNull();
      expect(
        (
          await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })
        ).updatedAt.getTime(),
      ).toBeGreaterThan(oldUpdatedAt.getTime());
    });

    it('refuse le retrait par un utilisateur autre que le créateur (403)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );

      await withdrawInvitation(invitation.id, wallet.id, invitee).expect(403);

      expect(await findMembership()).toEqual(invitation);
    });

    it('retourne 404 si l’invitation appartient à un autre portefeuille', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const otherWallet = await testFixtures().createWallet(creator.id);

      await withdrawInvitation(invitation.id, otherWallet.id).expect(404);

      expect(await findMembership()).toEqual(invitation);
    });

    it('refuse le retrait d’une adhésion MEMBER sans la supprimer (409)', async () => {
      const membership = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
        { status: 'MEMBER', acceptedAt: new Date() },
      );

      await withdrawInvitation(membership.id).expect(409);

      expect(await findMembership()).toEqual(membership);
    });

    it('refuse une invitation existante sur un portefeuille fermé (409)', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      await withdrawInvitation(invitation.id).expect(409);

      expect(await findMembership()).toEqual(invitation);
    });

    it('ne réussit pas simultanément avec l’acceptation', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const responses = await Promise.all([
        acceptInvitation(invitation.id),
        withdrawInvitation(invitation.id),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(await findMembership()).toMatchObject({
        id: invitation.id,
        status: 'MEMBER',
      });
    });

    it('ne réussit pas simultanément avec la clôture', async () => {
      const invitation = await testFixtures().createMembership(
        wallet.id,
        invitee.id,
      );
      const [withdrawResponse, closeResponse] = await Promise.all([
        withdrawInvitation(invitation.id),
        request(server())
          .post(`/wallets/${wallet.id}/close`)
          .set('Authorization', authorization(creator)),
      ]);

      expect(
        (withdrawResponse.status === 204 && closeResponse.status === 200) ||
          (withdrawResponse.status === 409 && closeResponse.status === 200),
      ).toBe(true);
      const currentWallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });
      expect(currentWallet.status).toBe('CLOSED');
      expect(await findMembership()).toBeNull();
    });
  });
});
