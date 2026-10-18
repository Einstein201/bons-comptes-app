import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.js';

export default defineConfig({
  ...unitConfig,
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
  },
});
