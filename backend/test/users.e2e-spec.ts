import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { UsersController } from '../src/users/users.controller.js';
import { UsersService } from '../src/users/users.service.js';
import type { CreateUserInput } from '../src/users/users.service.js';

describe('UsersController (e2e)', () => {
  let app: Awaited<ReturnType<TestingModule['createNestApplication']>>;
  const usersService = {
    create: vi.fn(),
  };

  beforeEach(async () => {
    usersService.create.mockReset();
    usersService.create.mockResolvedValue({
      id: 'user-123',
      email: 'alice@example.com',
      name: 'Alice',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
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
  });

  it('creates an account from a valid request', async () => {
    const input: CreateUserInput = {
      email: 'alice@example.com',
      name: 'Alice',
      password: 'motdepasse123',
    };

    await request(app.getHttpServer())
      .post('/users')
      .send(input)
      .expect(201)
      .expect({
        id: 'user-123',
        email: 'alice@example.com',
        name: 'Alice',
        createdAt: '2026-01-01T00:00:00.000Z',
      });

    expect(usersService.create).toHaveBeenCalledWith(input);
  });

  it('rejects an invalid email before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({
        email: 'invalid-email',
        name: 'Alice',
        password: 'motdepasse123',
      })
      .expect(400);

    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than eight characters', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({
        email: 'alice@example.com',
        name: 'Alice',
        password: 'short',
      })
      .expect(400);

    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('rejects unexpected properties', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({
        email: 'alice@example.com',
        name: 'Alice',
        password: 'motdepasse123',
        isAdmin: true,
      })
      .expect(400);

    expect(usersService.create).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    await app.close();
  });
});
