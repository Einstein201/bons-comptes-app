import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.js';

// Suite de contrat isolée : elle utilise une base PostgreSQL dédiée.
export default defineConfig({
  ...unitConfig,
  test: {
    environment: 'node',
    include: ['test/invitations.contract-spec.ts'],
    hookTimeout: 15_000,
  },
});
