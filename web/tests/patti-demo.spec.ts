import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'fs';

const OUT = path.join(__dirname, '../test-output/patti-demo');

async function open(page: Page, route: string) {
  await setupClerkTestingToken({ page });
  await page.goto(route);
}

function farmerCard(page: Page, n: number) {
  return page.locator('section').filter({ hasText: `Farmer ${n}` }).first();
}

function lotCard(farmer: Locator, n: number) {
  return farmer.locator('div.rounded-lg.border').nth(n - 1);
}

function bagCard(lot: Locator, n: number) {
  return lot.locator('div.rounded-md').filter({ hasText: `Bag ${n}` }).first();
}

async function fillAndBlur(input: Locator, value: string) {
  await input.fill(value);
  await input.press('Escape').catch(() => {});
}

async function fillBag(card: Locator, name: string, kg: string, rate: string) {
  await fillAndBlur(card.getByPlaceholder('Name or CASH SALES'), name);
  await card.getByPlaceholder('0', { exact: true }).fill(kg);
  await card.getByPlaceholder('220', { exact: true }).or(card.getByPlaceholder('22', { exact: true })).first().fill(rate);
}

test.describe('Patti Book demo with identifiable data', () => {
  test('fills two farmers, item beside farmer, one line per bag', async ({ page }, info) => {
    mkdirSync(OUT, { recursive: true });
    await open(page, '/entry');
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible();

    const f1 = farmerCard(page, 1);
    await fillAndBlur(f1.getByPlaceholder('LOCAL, RSB…'), 'PWTEST_FARMER_LOCAL');
    await fillAndBlur(f1.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_CHILLI');

    const chilli = lotCard(f1, 1);
    await chilli.getByPlaceholder('200').fill('200');
    await chilli.getByPlaceholder('3000').fill('3000');
    await fillBag(bagCard(chilli, 1), 'PWTEST_RAMESH', '48', '220');
    await chilli.getByRole('button', { name: '+ Add bag' }).click();
    await fillBag(bagCard(chilli, 2), 'PWTEST_RAMESH', '52', '220');
    await chilli.getByRole('button', { name: '+ Add bag' }).click();
    await fillBag(bagCard(chilli, 3), 'PWTEST_KRISHNA', '40', '220');

    await expect(chilli.getByText('Item · PWTEST_CHILLI')).toBeVisible();
    await expect(f1.getByPlaceholder('CHILLI, BEANS…').first()).toHaveValue('PWTEST_CHILLI');
    await expect(f1.getByPlaceholder('LOCAL, RSB…')).toHaveValue('PWTEST_FARMER_LOCAL');

    await f1.getByRole('button', { name: '+ Add item' }).click();
    const beans = lotCard(f1, 2);
    await fillAndBlur(beans.getByPlaceholder('CHILLI, BEANS…'), 'PWTEST_BEANS');
    await beans.getByPlaceholder('200').fill('50');
    await beans.getByPlaceholder('3000').fill('1000');
    await fillBag(bagCard(beans, 1), 'PWTEST_SURESH', '22', '180');
    await expect(beans.getByText('Item 2 · PWTEST_BEANS')).toBeVisible();

    await page.getByRole('button', { name: '+ Add farmer' }).click();
    const f2 = farmerCard(page, 2);
    await expect(f2).toBeVisible();
    await fillAndBlur(f2.getByPlaceholder('LOCAL, RSB…'), 'PWTEST_FARMER_RSB');
    await fillAndBlur(f2.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_TOMATO');
    const tomato = lotCard(f2, 1);
    await tomato.getByPlaceholder('200').fill('40');
    await tomato.getByPlaceholder('3000').fill('800');
    await fillBag(bagCard(tomato, 1), 'PWTEST_ANAND', '19', '150');
    await expect(tomato.getByText('Item · PWTEST_TOMATO')).toBeVisible();

    await expect(page.getByPlaceholder('LOCAL, RSB…')).toHaveCount(2);

    const tag = info.project.name;
    await page.getByRole('heading', { name: 'Patti Book' }).click();
    await f1.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(OUT, `${tag}-01-farmer-local-full.png`),
      fullPage: true,
    });
    await chilli.screenshot({ path: path.join(OUT, `${tag}-02-chilli-bags.png`) });
    await beans.screenshot({ path: path.join(OUT, `${tag}-03-beans-bag.png`) });
    await f2.scrollIntoViewIfNeeded();
    await f2.screenshot({ path: path.join(OUT, `${tag}-04-farmer-rsb.png`) });
  });
});
