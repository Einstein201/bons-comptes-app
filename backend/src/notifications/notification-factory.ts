import type { Prisma } from '@prisma/client';

// Les notifications sont créées dans la transaction de l'action qui les provoque :
// elles n'existent que si l'invitation ou la confirmation a réellement eu lieu.

export function formatEuros(cents: number): string {
  const text = (cents / 100).toFixed(2).replace('.', ',');
  return `${text.endsWith(',00') ? text.slice(0, -3) : text} €`;
}

export async function notifyInvitationReceived(
  transaction: Prisma.TransactionClient,
  invitation: {
    inviteeId: string;
    inviterId: string;
    walletId: string;
    walletTitle: string;
  },
) {
  const inviter = await transaction.user.findUniqueOrThrow({
    where: { id: invitation.inviterId },
    select: { name: true },
  });

  await transaction.notification.create({
    data: {
      userId: invitation.inviteeId,
      type: 'INVITATION_RECEIVED',
      message: `${inviter.name} vous a invité à ${invitation.walletTitle}`,
      walletId: invitation.walletId,
    },
  });
}

// L'émetteur et le destinataire sont prévenus, sauf celui qui vient de confirmer.
export async function notifyRepaymentConfirmed(
  transaction: Prisma.TransactionClient,
  confirmation: {
    walletId: string;
    actorId: string;
    fromUserId: string;
    toUserId: string;
    amount: number;
  },
) {
  const { walletId, actorId, fromUserId, toUserId } = confirmation;
  const users = await transaction.user.findMany({
    where: { id: { in: [fromUserId, toUserId] } },
    select: { id: true, name: true },
  });
  const nameOf = (id: string) =>
    users.find((user) => user.id === id)?.name ?? 'Un membre';
  const amount = formatEuros(confirmation.amount);

  const notifications = [
    {
      userId: fromUserId,
      message: `Votre remboursement de ${amount} à ${nameOf(toUserId)} a été confirmé`,
    },
    {
      userId: toUserId,
      message: `${nameOf(fromUserId)} a réglé sa dette de ${amount}`,
    },
  ].filter(({ userId }) => userId !== actorId);

  if (notifications.length === 0) {
    return;
  }

  await transaction.notification.createMany({
    data: notifications.map(({ userId, message }) => ({
      userId,
      type: 'REPAYMENT_CONFIRMED' as const,
      message,
      walletId,
    })),
  });
}
