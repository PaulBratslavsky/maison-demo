import { defineConfig } from '@playwright/test';

/**
 * Needs the demo's Strapi running on port 1338 (`npm run dev:strapi` at the repo root). Uses the Maison app on 3003 when
 * it's already running, and otherwise starts `npm run dev` (the app and the LINE verify mock) for the run and stops it after.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3003',
    viewport: { width: 390, height: 844 },
    // A failed test keeps a trace of its actions and screenshots, but not the network log or the DOM snapshots: those
    // would store the customer's session token (every /mcp request carries it, and the token exchange answers with it).
    // Running with `--trace on` records everything again, so don't share a trace made that way.
    trace: { mode: 'retain-on-failure', snapshots: { dom: false, aria: true, screen: true }, screenshots: true, sources: false, attachments: false },
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:3003', reuseExistingServer: true, timeout: 180_000 },
});
