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

function saleCard(lot: Locator, n: number) {
  return lot.locator('div.rounded-md').filter({ hasText: `Customer #${n}` }).first();
}

async function fillAndBlur(input: Locator, value: string) {
  await input.fill(value);
  await input.press('Escape').catch(() => {});
}

test.describe('Patti Book demo with identifiable data', () => {
  test('one sale tile with bag count and per-bag kg', async ({ page }, info) => {
    mkdirSync(OUT, { recursive: true });
    await open(page, '/entry');
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible();

    const f1 = farmerCard(page, 1);
    await fillAndBlur(f1.getByPlaceholder('LOCAL, RSB…'), 'PWTEST_FARMER_LOCAL');
    await fillAndBlur(f1.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_CHILLI');

    const chilli = lotCard(f1, 1);
    await chilli.getByPlaceholder('200').fill('200');
    await chilli.getByPlaceholder('3000').fill('3000');
    const ramesh = saleCard(chilli, 1);
    await fillAndBlur(ramesh.getByPlaceholder('Name or CASH SALES'), 'PWTEST_RAMESH');
    await ramesh.getByPlaceholder('20', { exact: true }).fill('2');
    await expect(ramesh.getByPlaceholder('kg')).toHaveCount(2);
    await ramesh.getByPlaceholder('kg').nth(0).fill('48');
    await ramesh.getByPlaceholder('kg').nth(1).fill('52');
    await ramesh.getByPlaceholder('220', { exact: true }).fill('220');

    await chilli.getByRole('button', { name: '+ Add customer' }).click();
    const krishna = saleCard(chilli, 2);
    await fillAndBlur(krishna.getByPlaceholder('Name or CASH SALES'), 'PWTEST_KRISHNA');
    await krishna.getByPlaceholder('20', { exact: true }).fill('1');
    await krishna.getByPlaceholder('kg').fill('40');
    await krishna.getByPlaceholder('220', { exact: true }).fill('220');

    await expect(chilli.getByText('Item · PWTEST_CHILLI')).toBeVisible();
    await expect(ramesh.getByPlaceholder('Name or CASH SALES')).toHaveCount(1);
    await expect(page.getByPlaceholder('Name or CASH SALES')).toHaveCount(2);

    await f1.getByRole('button', { name: '+ Add item' }).click();
    const beans = lotCard(f1, 2);
    await fillAndBlur(beans.getByPlaceholder('CHILLI, BEANS…'), 'PWTEST_BEANS');
    await beans.getByPlaceholder('200').fill('50');
    await beans.getByPlaceholder('3000').fill('1000');
    const suresh = saleCard(beans, 1);
    await fillAndBlur(suresh.getByPlaceholder('Name or CASH SALES'), 'PWTEST_SURESH');
    await suresh.getByPlaceholder('20', { exact: true }).fill('1');
    await suresh.getByPlaceholder('kg').fill('22');
    await suresh.getByPlaceholder('180').or(suresh.getByPlaceholder('220', { exact: true })).first().fill('180');

    await page.getByRole('button', { name: '+ Add farmer' }).click();
    const f2 = farmerCard(page, 2);
    await fillAndBlur(f2.getByPlaceholder('LOCAL, RSB…'), 'PWTEST_FARMER_RSB');
    await fillAndBlur(f2.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_TOMATO');
    const tomato = lotCard(f2, 1);
    await tomato.getByPlaceholder('200').fill('40');
    await tomato.getByPlaceholder('3000').fill('800');
    const anand = saleCard(tomato, 1);
    await fillAndBlur(anand.getByPlaceholder('Name or CASH SALES'), 'PWTEST_ANAND');
    await anand.getByPlaceholder('20', { exact: true }).fill('1');
    await anand.getByPlaceholder('kg').fill('19');

    const tag = info.project.name;
    await page.getByRole('heading', { name: 'Patti Book' }).click();
    await page.screenshot({ path: path.join(OUT, `${tag}-01-full.png`), fullPage: true });
    await chilli.screenshot({ path: path.join(OUT, `${tag}-02-chilli-sale.png`) });
    await f2.screenshot({ path: path.join(OUT, `${tag}-03-farmer-rsb.png`) });
  });
});
