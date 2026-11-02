import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let invitationsService: {
    decline: Mock;
    remove: Mock;
  };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    invitationsService = {
      decline: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    controller = new InvitationsController(
      invitationsService as unknown as InvitationsService,
    );
  });

  it('declines the invitation as the authenticated user', async () => {
    await expect(
      controller.decline('invitation-1', request),
    ).resolves.toBeUndefined();

    expect(invitationsService.decline).toHaveBeenCalledWith(
      'invitation-1',
      'user-123',
    );
  });

  it('removes the invitation as the authenticated wallet creator', async () => {
    await expect(
      controller.remove('wallet-1', 'invitation-1', request),
    ).resolves.toBeUndefined();

    expect(invitationsService.remove).toHaveBeenCalledWith(
      'wallet-1',
      'invitation-1',
      'user-123',
    );
  });
});
