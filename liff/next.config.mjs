import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode runs effects twice in development, which would record every tool call twice in the agent view.
  reactStrictMode: false,
  // liff/ has its own package-lock.json, and so do the repo root and strapi/. Pin Turbopack's workspace root to liff/.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  // Which LIFF this build signs in with: `npm run tunnel` refuses to expose a build on the LIFF mock.
  // Next loads liff/.env before this file, so the value is the one the build inlines.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Maison-Liff', value: process.env.NEXT_PUBLIC_LIFF_MOCK === 'false' ? 'line' : 'mock' }],
      },
    ];
  },
};

export default nextConfig;
