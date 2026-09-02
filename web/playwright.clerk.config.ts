import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

/**
 * Signed-in Playwright. Loads DB from `.env.local` and Clerk test keys
 * from `.env.clerk.dev` (gitignored). Does not change the no-auth suite
 * in playwright.config.ts.
 */
function loadEnvFile(file: string, override = false) {
  const full = path.resolve(file);
  if (!existsSync(full)) return;
  for (const raw of readFileSync(full, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env.clerk.dev', true);
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

const authFile = path.join(__dirname, 'playwright/.clerk/user.json');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
  },
  projects: [
    { name: 'setup', testMatch: /clerk\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: /signed-in\.spec\.ts|patti-demo\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
        headless: true,
      },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testMatch: /signed-in\.spec\.ts|patti-demo\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        storageState: authFile,
        headless: true,
      },
    },
  ],
  webServer: {
    command: 'npx next dev -p 3002',
    url: 'http://localhost:3002',
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: '.',
    env: {
      ...process.env,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || '',
    },
  },
});
