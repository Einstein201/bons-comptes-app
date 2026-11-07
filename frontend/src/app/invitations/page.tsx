import { redirect } from 'next/navigation';

// Les invitations se gèrent dans l'onglet du tableau de bord : l'ancienne adresse reste valide.
export default function InvitationsPage(): never {
  redirect('/?tab=invitations');
}
