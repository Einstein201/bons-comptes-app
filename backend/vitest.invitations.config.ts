import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.js';

// Suite de contrat explicite tant que les routes IF-13 ne sont pas implémentées.
export default defineConfig({
  ...unitConfig,
  test: {
    environment: 'node',
    include: ['test/invitations.contract-spec.ts'],
    hookTimeout: 15_000,
  },
});
