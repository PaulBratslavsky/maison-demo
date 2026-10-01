import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // lib/home-page.ts imports 'server-only', which Next resolves from its own compiled copy and no package installs.
  // Under test it's the empty module that Next uses on the server.
  resolve: {
    alias: { 'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)) },
  },
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
});
