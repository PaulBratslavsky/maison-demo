import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode runs effects twice in development, which would record every tool call twice in the agent view.
  reactStrictMode: false,
  // The stage runs on `next dev`: no Next badge in a corner of the projected screen.
  devIndicators: false,
  // liff/ has its own package-lock.json, and so do the repo root and strapi/. Pin Turbopack's workspace root to liff/.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  // Which LIFF this server signs in with, which `npm run tunnel` reads: line only for a production build in LINE mode,
  // the one `npm run start:line` serves. A dev server in LINE mode says line-dev, and the tunnel refuses it as it
  // refuses mock. Next loads liff/.env before this file, and its CLI sets NODE_ENV (production for build and start).
  async headers() {
    const lineMode = process.env.NEXT_PUBLIC_LIFF_MOCK === 'false';
    const value = !lineMode ? 'mock' : process.env.NODE_ENV === 'production' ? 'line' : 'line-dev';
    return [{ source: '/:path*', headers: [{ key: 'X-Maison-Liff', value }] }];
  },
};

export default nextConfig;
