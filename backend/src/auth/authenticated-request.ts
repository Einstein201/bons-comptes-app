import type { Request } from 'express';

// Forme de request.user posée par la stratégie JWT du mécanisme d'authentification (IF-11).
export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
  };
}
