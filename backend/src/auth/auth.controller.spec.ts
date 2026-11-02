import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { changePassword: Mock; setRefreshCookie: Mock };

  const request = { user: { userId: 'user-123' } } as never;

  beforeEach(() => {
    authService = {
      changePassword: vi.fn(),
      setRefreshCookie: vi.fn(),
    };
    controller = new AuthController(authService as unknown as AuthService);
  });

  it('passes the JWT identity to the password change service', async () => {
    const result = {
      message: 'Mot de passe modifié avec succès.',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    };
    authService.changePassword.mockResolvedValue(result);
    await expect(
      controller.changePassword(
        {
          currentPassword: 'ancien-mot-de-passe',
          newPassword: 'nouveau-mot-de-passe',
        },
        request,
        {} as never,
      ),
    ).resolves.toEqual({
      message: result.message,
      accessToken: result.accessToken,
    });

    expect(authService.changePassword).toHaveBeenCalledWith('user-123', {
      currentPassword: 'ancien-mot-de-passe',
      newPassword: 'nouveau-mot-de-passe',
    });
    expect(authService.setRefreshCookie).toHaveBeenCalledWith(
      expect.anything(),
      result.refreshToken,
    );
  });
});
