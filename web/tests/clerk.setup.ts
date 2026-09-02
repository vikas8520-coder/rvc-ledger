import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'fs';

setup.describe.configure({ mode: 'serial' });

const authFile = path.join(__dirname, '../playwright/.clerk/user.json');

setup('clerk testing token', async () => {
  if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  }
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Clerk test keys. Run `clerk env pull --file .env.clerk.dev` in web/.',
    );
  }
  if (!process.env.E2E_CLERK_USER_EMAIL) {
    throw new Error(
      'Set E2E_CLERK_USER_EMAIL in .env.clerk.dev to the shop owner email.',
    );
  }
  await clerkSetup();
});

setup('sign in shop user', async ({ page }) => {
  mkdirSync(path.dirname(authFile), { recursive: true });
  await page.goto('/sign-in');
  await clerk.loaded({ page });
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
  });
  await page.goto('/entry');
  await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible({
    timeout: 30_000,
  });
  await page.context().storageState({ path: authFile });
});
