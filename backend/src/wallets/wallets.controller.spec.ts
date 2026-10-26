import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';

describe('WalletsController', () => {
  let controller: WalletsController;
  let walletsService: { create: Mock; findOne: Mock; listForUser: Mock };

  beforeEach(() => {
    walletsService = {
      create: vi.fn(),
      findOne: vi.fn(),
      listForUser: vi.fn(),
    };
    controller = new WalletsController(
      walletsService as unknown as WalletsService,
    );
  });

  it('uses the authenticated user as creator', async () => {
    const wallet = { id: 'wallet-123' };
    walletsService.create.mockResolvedValue(wallet);

    await expect(
      controller.create({ title: 'Wallet', description: 'Description' }, {
        user: { userId: 'user-123' },
      } as never),
    ).resolves.toEqual(wallet);

    expect(walletsService.create).toHaveBeenCalledWith(
      { title: 'Wallet', description: 'Description' },
      'user-123',
    );
  });

  it('does not accept a client-supplied creator', async () => {
    walletsService.create.mockResolvedValue({ id: 'wallet-123' });

    await controller.create(
      { title: 'Wallet', createdById: 'attacker' } as never,
      { user: { userId: 'user-123' } } as never,
    );

    expect(walletsService.create).toHaveBeenCalledWith(
      { title: 'Wallet', createdById: 'attacker' },
      'user-123',
    );
  });

  it('lists the wallets of the authenticated user with the requested pagination', async () => {
    const sections = { open: { items: [], nextCursor: null } };
    walletsService.listForUser.mockResolvedValue(sections);

    await expect(
      controller.findAll({ limit: 5 }, {
        user: { userId: 'user-123' },
      } as never),
    ).resolves.toBe(sections);

    expect(walletsService.listForUser).toHaveBeenCalledWith('user-123', {
      limit: 5,
    });
  });

  it('reads a wallet as the authenticated user', async () => {
    const result = {
      wallet: { id: 'wallet-123' },
      members: { items: [], nextCursor: null },
    };
    walletsService.findOne.mockResolvedValue(result);

    await expect(
      controller.findOne('wallet-123', { limit: 20 }, {
        user: { userId: 'user-123' },
      } as never),
    ).resolves.toEqual(result);

    expect(walletsService.findOne).toHaveBeenCalledWith(
      'wallet-123',
      'user-123',
      { limit: 20 },
    );
  });
});
