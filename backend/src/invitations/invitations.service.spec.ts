import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { InvitationsService } from './invitations.service.js';

describe('InvitationsService.decline', () => {
  let service: InvitationsService;
  let prisma: { $transaction: Mock };
  let transaction: {
    $queryRaw: Mock;
    walletMember: { findUnique: Mock; deleteMany: Mock };
    wallet: { update: Mock };
  };

  const pendingInvitation = {
    walletId: 'wallet-1',
    userId: 'invitee',
    status: 'INVITED',
  };

  beforeEach(() => {
    transaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ createdById: 'creator', status: 'OPEN' }]),
      walletMember: {
        findUnique: vi.fn().mockResolvedValue(pendingInvitation),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      wallet: { update: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    service = new InvitationsService(prisma as unknown as PrismaService);
  });

  it('supprime l’invitation en attente du destinataire', async () => {
    await expect(
      service.decline('invitation-1', 'invitee'),
    ).resolves.toBeUndefined();

    expect(transaction.walletMember.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'invitation-1',
        walletId: 'wallet-1',
        userId: 'invitee',
        status: 'INVITED',
      },
    });
  });

  it('verrouille le porte-monnaie puis rafraîchit sa date de mise à jour', async () => {
    await service.decline('invitation-1', 'invitee');

    const [sqlParts] = transaction.$queryRaw.mock.calls[0];
    expect(sqlParts.join('')).toContain('FOR UPDATE');
    expect(transaction.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('refuse l’invitation d’un autre utilisateur sans rien modifier', async () => {
    await expect(
      service.decline('invitation-1', 'someone-else'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('répond 404 quand l’invitation n’existe pas', async () => {
    transaction.walletMember.findUnique.mockResolvedValue(null);

    await expect(service.decline('unknown', 'invitee')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('répond 404 quand l’invitation disparaît pendant le verrouillage', async () => {
    transaction.walletMember.findUnique
      .mockResolvedValueOnce(pendingInvitation)
      .mockResolvedValueOnce(null);

    await expect(
      service.decline('invitation-1', 'invitee'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('répond 404 quand le porte-monnaie n’existe plus', async () => {
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(
      service.decline('invitation-1', 'invitee'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('refuse une invitation déjà acceptée', async () => {
    transaction.walletMember.findUnique.mockResolvedValue({
      ...pendingInvitation,
      status: 'MEMBER',
    });

    await expect(
      service.decline('invitation-1', 'invitee'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('refuse une invitation vers un porte-monnaie clôturé', async () => {
    transaction.$queryRaw.mockResolvedValue([
      { createdById: 'creator', status: 'CLOSED' },
    ]);

    await expect(
      service.decline('invitation-1', 'invitee'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.walletMember.deleteMany).not.toHaveBeenCalled();
  });

  it('répond 409 si l’invitation a été traitée entre-temps', async () => {
    transaction.walletMember.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.decline('invitation-1', 'invitee'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.wallet.update).not.toHaveBeenCalled();
  });
});
