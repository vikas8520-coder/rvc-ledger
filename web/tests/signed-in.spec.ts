import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, path: string) {
  await setupClerkTestingToken({ page });
  await page.goto(path);
}

test.describe('signed-in shop', () => {
  test('home is the shop, not the sign-in gate', async ({ page }) => {
    await open(page, '/');
    await expect(page.getByText('Sign in to access your shop')).toHaveCount(0);
    await expect(page.getByText(/FY /).first()).toBeVisible();
  });

  test('patti book farmer field can be typed', async ({ page }) => {
    await open(page, '/entry');
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible();
    const farmer = page.getByPlaceholder('LOCAL, RSB…');
    await expect(farmer).toBeVisible();
    await farmer.fill('LOCAL');
    await expect(farmer).toHaveValue('LOCAL');
    await expect(page.getByRole('button', { name: /Save patti/i })).toBeVisible();
  });

  test('patti book groups customers under each farmer product', async ({ page }) => {
    await open(page, '/entry');
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible();
    await expect(page.getByText('What the farmer brought')).toBeVisible();
    await expect(page.getByPlaceholder('LOCAL, RSB…')).toBeVisible();
    await expect(page.getByPlaceholder('CHILLI, BEANS…')).toHaveCount(1);
    await expect(page.getByText('Parties who bought this')).toHaveCount(1);
    await expect(page.getByPlaceholder('Name or CASH SALES')).toHaveCount(1);

    await page.getByPlaceholder('LOCAL, RSB…').fill('LOCAL');
    await page.getByPlaceholder('CHILLI, BEANS…').fill('CHILLI');
    await page.getByPlaceholder('Name or CASH SALES').fill('RAMESH');
    await expect(page.getByText('Item · CHILLI')).toBeVisible();

    await page.getByRole('button', { name: '+ Add bag' }).click();
    await expect(page.getByPlaceholder('Name or CASH SALES')).toHaveCount(2);
    await expect(page.getByPlaceholder('CHILLI, BEANS…')).toHaveCount(1);

    await page.getByRole('button', { name: '+ Add item' }).click();
    await expect(page.getByPlaceholder('CHILLI, BEANS…')).toHaveCount(2);
    await expect(page.getByText('Parties who bought this')).toHaveCount(2);
    await page.getByPlaceholder('CHILLI, BEANS…').nth(1).fill('BEANS');
    await page.getByPlaceholder('Name or CASH SALES').nth(2).fill('SURESH');
    await expect(page.getByText('Item 2 · BEANS')).toBeVisible();

    await page.getByRole('button', { name: '+ Add farmer' }).click();
    await expect(page.getByText('Farmer 2')).toBeVisible();
    await expect(page.getByPlaceholder('LOCAL, RSB…')).toHaveCount(2);
    await expect(page.getByPlaceholder('CHILLI, BEANS…')).toHaveCount(3);
  });

  test('print hub shows the five jobs', async ({ page }) => {
    await open(page, '/print');
    await expect(page.getByRole('heading', { name: 'Print' })).toBeVisible();
    await expect(page.getByText('Farmer patti', { exact: true })).toBeVisible();
    await expect(page.getByText('Customer bills', { exact: true })).toBeVisible();
    await expect(page.getByText('Docket / gate pass', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Farmer patti/i }).click();
    await expect(page).toHaveURL(/\/print/);
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toHaveCount(0);
  });

  test('payment form is ready to collect', async ({ page }) => {
    await open(page, '/payment');
    await expect(page.getByRole('heading', { name: /Record payment/i })).toBeVisible();
    await expect(page.getByText('Amount received', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Record payment/i })).toBeVisible();
  });

  test('pages do not overflow sideways', async ({ page }) => {
    for (const path of ['/', '/entry', '/print', '/payment', '/customers']) {
      await open(page, path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      );
      expect(overflow, `${path} overflows horizontally`).toBe(false);
    }
  });
});
