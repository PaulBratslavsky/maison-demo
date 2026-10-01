import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode runs effects twice in development, which would record every tool call twice in the agent view.
  reactStrictMode: false,
  // liff/ has its own package-lock.json, and so do the repo root and strapi/. Pin Turbopack's workspace root to liff/.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
