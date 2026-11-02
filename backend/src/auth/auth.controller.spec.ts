import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { changePassword: Mock };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    authService = { changePassword: vi.fn() };
    controller = new AuthController(authService as unknown as AuthService);
  });

  it('passes the JWT identity to the password change service', async () => {
    const result = { message: 'Mot de passe modifié avec succès.' };
    authService.changePassword.mockResolvedValue(result);

    await expect(
      controller.changePassword(
        {
          currentPassword: 'ancien-mot-de-passe',
          newPassword: 'nouveau-mot-de-passe',
        },
        request,
      ),
    ).resolves.toBe(result);

    expect(authService.changePassword).toHaveBeenCalledWith('user-123', {
      currentPassword: 'ancien-mot-de-passe',
      newPassword: 'nouveau-mot-de-passe',
    });
  });
});
