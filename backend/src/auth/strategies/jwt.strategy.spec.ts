import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it } from 'vitest';

import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = new ConfigService({
      JWT_SECRET: 'secret-utilise-uniquement-pour-les-tests',
    });

    strategy = new JwtStrategy(config);
  });

  it('retourne l’identité pour un access token', () => {
    const payload = {
      sub: 'user-1',
      tokenType: 'access',
    };

    expect(strategy.validate(payload)).toEqual({
      userId: 'user-1',
    });
  });

  it('refuse un refresh token', () => {
    const payload = {
      sub: 'user-1',
      tokenType: 'refresh',
    };

    expect(() => strategy.validate(payload))
      .toThrow(UnauthorizedException);
  });

  it('refuse un payload sans identifiant utilisateur', () => {
    const payload = {
      tokenType: 'access',
    };

    expect(() => strategy.validate(payload))
      .toThrow(UnauthorizedException);
  });

  it('refuse un payload sans type de jeton', () => {
    const payload = {
      sub: 'user-1',
    };

    expect(() => strategy.validate(payload))
      .toThrow(UnauthorizedException);
  });
});