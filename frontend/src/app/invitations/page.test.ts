import { expect, it, vi } from 'vitest';
import InvitationsPage from './page';

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

it('redirige vers l’onglet des invitations du tableau de bord', () => {
  InvitationsPage();

  expect(mocks.redirect).toHaveBeenCalledWith('/?tab=invitations');
});
