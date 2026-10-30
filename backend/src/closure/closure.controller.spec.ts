import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ClosureController } from './closure.controller.js';
import { ClosureService } from './closure.service.js';

describe('ClosureController', () => {
  let controller: ClosureController;
  let closureService: {
    close: Mock;
    getBalance: Mock;
    getOptimizedPayments: Mock;
  };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    closureService = {
      close: vi.fn(),
      getBalance: vi.fn(),
      getOptimizedPayments: vi.fn(),
    };
    controller = new ClosureController(
      closureService as unknown as ClosureService,
    );
  });

  it('closes the wallet of the URL as the authenticated user', async () => {
    const wallet = { id: 'wallet-1', status: 'CLOSED' };
    closureService.close.mockResolvedValue(wallet);

    await expect(controller.close('wallet-1', request)).resolves.toBe(wallet);

    expect(closureService.close).toHaveBeenCalledWith('wallet-1', 'user-123');
  });

  it('returns the balance of the wallet of the URL for the authenticated user', async () => {
    const balance = { walletId: 'wallet-1', totalAmount: 0 };
    closureService.getBalance.mockResolvedValue(balance);

    await expect(controller.getBalance('wallet-1', request)).resolves.toBe(
      balance,
    );

    expect(closureService.getBalance).toHaveBeenCalledWith(
      'wallet-1',
      'user-123',
    );
  });

  it('returns the optimized payments of the wallet of the URL for the authenticated user', async () => {
    const payments = { walletId: 'wallet-1', transfers: [] };
    closureService.getOptimizedPayments.mockResolvedValue(payments);

    await expect(
      controller.getOptimizedPayments('wallet-1', request),
    ).resolves.toBe(payments);

    expect(closureService.getOptimizedPayments).toHaveBeenCalledWith(
      'wallet-1',
      'user-123',
    );
  });
});
