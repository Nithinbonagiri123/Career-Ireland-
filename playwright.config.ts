import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

/**
 * Playwright E2E harness for the CRM.
 *
 * - `globalSetup` idempotently seeds a known ADMIN user + logs in once, saving
 *   the session cookie to `playwright/.auth/admin.json`.
 * - Test projects reuse that storageState so individual tests skip login.
 * - `webServer` boots `pnpm dev` if it's not already running on port 3000.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // shared DB state — keep serial for now
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  forbidOnly: !!process.env.CI,

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 8_000,
  },

  projects: [
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
    },
    {
      name: 'anonymous',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*\.anon\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
