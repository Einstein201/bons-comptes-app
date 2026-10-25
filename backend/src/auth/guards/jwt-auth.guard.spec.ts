import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function contextWithUser(user?: { userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('rejects requests without an authenticated user', () => {
    expect(() => new JwtAuthGuard().canActivate(contextWithUser())).toThrow(
      UnauthorizedException,
    );
  });

  it('allows requests populated by the authentication mechanism', () => {
    expect(
      new JwtAuthGuard().canActivate(
        contextWithUser({ userId: 'authenticated-user' }),
      ),
    ).toBe(true);
  });
});
