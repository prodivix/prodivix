import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const sandboxPort = Number(process.env.E2E_SANDBOX_PORT ?? 4174);
const sandboxBaseURL =
  process.env.E2E_SANDBOX_BASE_URL ?? `http://127.0.0.1:${sandboxPort}`;
const browserChannel = process.env.E2E_BROWSER_CHANNEL;

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `pnpm --filter @prodivix/plugin-sandbox build && pnpm --filter @prodivix/plugin-sandbox preview --host 127.0.0.1 --port ${sandboxPort}`,
      cwd: repoRoot,
      reuseExistingServer: process.env.CI !== 'true',
      timeout: 120_000,
      url: `${sandboxBaseURL}/runtime-broker.html`,
    },
    {
      command: `pnpm --filter @prodivix/web build && pnpm --filter @prodivix/web preview --host 127.0.0.1 --port ${port}`,
      cwd: repoRoot,
      reuseExistingServer: process.env.CI !== 'true',
      timeout: 120_000,
      url: baseURL,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
    {
      name: 'firefox',
      use: devices['Desktop Firefox'],
    },
    {
      name: 'webkit',
      use: devices['Desktop Safari'],
    },
  ],
});
