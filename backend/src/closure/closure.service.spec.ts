import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClosureService } from './closure.service.js';

describe('ClosureService.close', () => {
  let closureService: ClosureService;
  let prisma: { $transaction: Mock };
  let transaction: {
    wallet: { findUnique: Mock; updateMany: Mock; findUniqueOrThrow: Mock };
    walletMember: { deleteMany: Mock };
  };

  const closedWallet = {
    id: 'wallet-1',
    title: 'Vacances',
    description: null,
    status: 'CLOSED',
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-27T10:00:00.000Z'),
    closedAt: new Date('2026-10-27T10:00:00.000Z'),
  };

  beforeEach(() => {
    transaction = {
      wallet: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ createdById: 'creator', status: 'OPEN' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(closedWallet),
      },
      walletMember: { deleteMany: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    closureService = new ClosureService(prisma as unknown as PrismaService);
  });

  it('closes an open wallet and returns it', async () => {
    await expect(closureService.close('wallet-1', 'creator')).resolves.toEqual(
      closedWallet,
    );

    expect(transaction.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'wallet-1', status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: expect.any(Date) },
    });
  });

  it('deletes the pending invitations in the same transaction', async () => {
    await closureService.close('wallet-1', 'creator');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.walletMember.deleteMany).toHaveBeenCalledWith({
      where: { walletId: 'wallet-1', status: 'INVITED' },
    });
  });

  it('throws NotFoundException when the wallet does not exist', async () => {
    transaction.wallet.findUnique.mockResolvedValue(null);

    await expect(
      closureService.close('unknown', 'creator'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the user is not the creator', async () => {
    await expect(
      closureService.close('wallet-1', 'someone-else'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.wallet.updateMany).not.toHaveBeenCalled();
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the wallet is already closed', async () => {
    transaction.wallet.findUnique.mockResolvedValue({
      createdById: 'creator',
      status: 'CLOSED',
    });
    transaction.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      closureService.close('wallet-1', 'creator'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });
});
