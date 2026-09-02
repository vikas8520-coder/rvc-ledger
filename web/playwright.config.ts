import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: [/clerk\.setup\.ts/, /signed-in\.spec\.ts/],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: false },
    },
  ],
  webServer: {
    // The current .env.local has DATABASE_URL but no Clerk keys,
    // so the app runs in no-auth mode with a real DB — perfect for testing.
    command: 'npx next dev -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: '.',
  },
});
