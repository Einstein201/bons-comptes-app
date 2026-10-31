import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RepaymentsController } from './repayments.controller.js';
import { RepaymentsService } from './repayments.service.js';

describe('RepaymentsController', () => {
  let controller: RepaymentsController;
  let repaymentsService: {
    declare: Mock;
    findAll: Mock;
    confirm: Mock;
    cancel: Mock;
  };

  const request = { user: { userId: 'user-123' } } as never;
  const repayment = { id: 'repayment-1' };

  beforeEach(() => {
    repaymentsService = {
      declare: vi.fn().mockResolvedValue(repayment),
      findAll: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      confirm: vi.fn().mockResolvedValue(repayment),
      cancel: vi.fn().mockResolvedValue(repayment),
    };
    controller = new RepaymentsController(
      repaymentsService as unknown as RepaymentsService,
    );
  });

  it('declares a repayment in the name of the authenticated user', async () => {
    const dto = { toUserId: 'recipient', amount: 2500 };

    await expect(controller.declare('wallet-1', dto, request)).resolves.toBe(
      repayment,
    );

    expect(repaymentsService.declare).toHaveBeenCalledWith(
      'wallet-1',
      'user-123',
      dto,
    );
  });

  it('lists the repayments for the authenticated user', async () => {
    const query = { status: 'PENDING' as const, limit: 20 };

    await expect(
      controller.findAll('wallet-1', query, request),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(repaymentsService.findAll).toHaveBeenCalledWith(
      'wallet-1',
      'user-123',
      query,
    );
  });

  it('confirms a repayment as the authenticated user', async () => {
    await expect(
      controller.confirm('wallet-1', 'repayment-1', request),
    ).resolves.toBe(repayment);

    expect(repaymentsService.confirm).toHaveBeenCalledWith(
      'wallet-1',
      'repayment-1',
      'user-123',
    );
  });

  it('cancels a repayment as the authenticated user', async () => {
    await expect(
      controller.cancel('wallet-1', 'repayment-1', request),
    ).resolves.toBe(repayment);

    expect(repaymentsService.cancel).toHaveBeenCalledWith(
      'wallet-1',
      'repayment-1',
      'user-123',
    );
  });
});
