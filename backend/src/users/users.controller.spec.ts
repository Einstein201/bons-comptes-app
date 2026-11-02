import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: { updateProfile: Mock };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    usersService = { updateProfile: vi.fn() };
    controller = new UsersController(usersService as unknown as UsersService);
  });

  it('updates the profile of the authenticated user', async () => {
    const profile = { userId: 'user-123', name: 'Alice mise à jour' };
    usersService.updateProfile.mockResolvedValue(profile);

    await expect(
      controller.updateProfile({ name: profile.name }, request),
    ).resolves.toBe(profile);

    expect(usersService.updateProfile).toHaveBeenCalledWith('user-123', {
      name: profile.name,
    });
  });
});
