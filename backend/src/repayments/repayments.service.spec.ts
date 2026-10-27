import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { RepaymentsService } from './repayments.service.js';

describe('RepaymentsService confirm and cancel', () => {
  let repaymentsService: RepaymentsService;
  let prisma: {
    $transaction: Mock;
    repayment: { findFirst: Mock };
  };
  let transaction: {
    repayment: { updateMany: Mock; findUniqueOrThrow: Mock };
    wallet: { update: Mock };
  };

  // debtor rembourse recipient ; creator a créé le porte-monnaie.
  const storedRepayment = {
    fromUserId: 'debtor',
    toUserId: 'recipient',
    wallet: { createdById: 'creator', status: 'CLOSED' },
  };

  beforeEach(() => {
    transaction = {
      repayment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'repayment-1' }),
      },
      wallet: { update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
      repayment: { findFirst: vi.fn().mockResolvedValue(storedRepayment) },
    };
    repaymentsService = new RepaymentsService(
      prisma as unknown as PrismaService,
    );
  });

  it('looks for the repayment inside the wallet of the URL only', async () => {
    await repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient');

    expect(prisma.repayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'repayment-1', walletId: 'wallet-1' },
      }),
    );
  });

  it.each(['recipient', 'creator'])(
    'lets the %s confirm a pending repayment',
    async (userId) => {
      await expect(
        repaymentsService.confirm('wallet-1', 'repayment-1', userId),
      ).resolves.toEqual({ id: 'repayment-1' });

      expect(transaction.repayment.updateMany).toHaveBeenCalledWith({
        where: { id: 'repayment-1', status: 'PENDING' },
        data: { status: 'PAID', paidAt: expect.any(Date) },
      });
    },
  );

  it.each(['debtor', 'stranger'])(
    'refuses the confirmation by the %s',
    async (userId) => {
      await expect(
        repaymentsService.confirm('wallet-1', 'repayment-1', userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.repayment.updateMany).not.toHaveBeenCalled();
    },
  );

  it('lets the debtor cancel a pending repayment', async () => {
    await repaymentsService.cancel('wallet-1', 'repayment-1', 'debtor');

    expect(transaction.repayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'repayment-1', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });

  it.each(['recipient', 'creator', 'stranger'])(
    'refuses the cancellation by the %s',
    async (userId) => {
      await expect(
        repaymentsService.cancel('wallet-1', 'repayment-1', userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(transaction.repayment.updateMany).not.toHaveBeenCalled();
    },
  );

  it('refreshes the wallet updatedAt in the same transaction', async () => {
    await repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('throws ConflictException when the repayment was already processed', async () => {
    transaction.repayment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.wallet.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the repayment is not in this wallet', async () => {
    prisma.repayment.findFirst.mockResolvedValue(null);

    await expect(
      repaymentsService.cancel('wallet-1', 'repayment-1', 'debtor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when the wallet is not closed', async () => {
    prisma.repayment.findFirst.mockResolvedValue({
      ...storedRepayment,
      wallet: { createdById: 'creator', status: 'OPEN' },
    });

    await expect(
      repaymentsService.confirm('wallet-1', 'repayment-1', 'recipient'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.repayment.updateMany).not.toHaveBeenCalled();
  });
});
