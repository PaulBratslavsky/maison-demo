import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Opt-in tests against the running Strapi and the local model: `npm run test:live`. */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { include: ['live/**/*.live.test.ts'], environment: 'node', testTimeout: 300_000, hookTimeout: 60_000, fileParallelism: false },
});
