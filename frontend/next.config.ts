import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  // En ligne, le navigateur appelle /api/... sur le domaine du frontend et Next relaie vers le backend :
  // le cookie de session reste ainsi sur un seul site.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');
    return target ? [{ source: '/api/:path*', destination: `${target}/:path*` }] : [];
  },
};

export default nextConfig;