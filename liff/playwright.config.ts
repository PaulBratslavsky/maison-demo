import { defineConfig } from '@playwright/test';

/**
 * Needs the demo's Strapi (the controller runs it). Uses the Maison app on 3003 when it's
 * running, and otherwise starts `npm run dev` (the app and the LINE verify mock) for the run and stops it after.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3003',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:3003', reuseExistingServer: true, timeout: 180_000 },
});
