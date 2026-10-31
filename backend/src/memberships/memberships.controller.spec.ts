import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

describe('MembershipsController', () => {
  let controller: MembershipsController;
  let membershipsService: { leave: Mock; remove: Mock };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    membershipsService = {
      leave: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    controller = new MembershipsController(
      membershipsService as unknown as MembershipsService,
    );
  });

  it('lets the authenticated user leave the wallet of the URL', async () => {
    await expect(
      controller.leave('wallet-1', request),
    ).resolves.toBeUndefined();

    expect(membershipsService.leave).toHaveBeenCalledWith(
      'wallet-1',
      'user-123',
    );
  });

  it('removes the member of the URL on behalf of the authenticated user', async () => {
    await expect(
      controller.remove('wallet-1', 'member-1', request),
    ).resolves.toBeUndefined();

    expect(membershipsService.remove).toHaveBeenCalledWith(
      'wallet-1',
      'member-1',
      'user-123',
    );
  });
});
