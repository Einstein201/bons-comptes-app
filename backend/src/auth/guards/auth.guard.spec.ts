import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { JwtAuthGuard } from './auth.guard.js';

describe('JwtAuthGuard', () => {
  it('refuse une requête sans utilisateur authentifié', () => {
    const guard = new JwtAuthGuard();
    const context = {} as ExecutionContext;

    expect(() =>
      guard.handleRequest(null, false, null, context),
    ).toThrow(UnauthorizedException);
  });
  it('accepte une requête avec un utilisateur authentifié', () => {
    const guard = new JwtAuthGuard();
    const context = {} as ExecutionContext;
    const user = { id: 'user-123', email: 'angela@gmail.com' };

    const result = guard.handleRequest(null, user, null, context);

    expect(result).toEqual(user);
  });
it('propage une erreur même si un utilisateur est présent', () => {
  const guard = new JwtAuthGuard();
  const context = {} as ExecutionContext;
  const user = { userId: '1' };
  const error = new UnauthorizedException(
    'Erreur d’authentification',
  );

  expect(() =>
    guard.handleRequest(error, user, null, context),
  ).toThrow(error);
});
});
