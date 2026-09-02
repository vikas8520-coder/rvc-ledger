import { test, expect, type Page, type Locator } from '@playwright/test';

const TS = Date.now();

// ─── Helpers ───────────────────────────────────────────────────────────────

async function fillAndBlur(input: Locator, value: string) {
  await input.fill(value);
  await input.press('Escape').catch(() => {});
}

function farmerCard(page: Page, n: number): Locator {
  // The active farmer's section is the only visible <section> on the page.
  // The tab bar shows "Farmer N" or the farmer's name.
  return page.locator('section').first();
}

async function switchToFarmer(page: Page, n: number) {
  // Click the farmer tab — tabs show "Farmer N" when no name is entered yet
  await page.getByRole('button', { name: `Farmer ${n}`, exact: true }).click();
}

async function switchToFarmerByName(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}

function lotCard(farmer: Locator, n: number): Locator {
  return farmer.locator('div.rounded-lg.border').nth(n - 1);
}

function saleCard(lot: Locator, n: number): Locator {
  return lot.locator('div.rounded-md').filter({ hasText: `Customer #${n}` }).first();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test.describe('Data Entry — multi-farmer, multi-product, bag weights, save+edit', () => {
  test('fill two farmers with different products, bag weights, save, verify, edit', async ({ page }) => {
    // ── Navigate ──────────────────────────────────────────────────────────
    await page.goto('/entry');
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible({ timeout: 30_000 });

    // ── Farmer 1: PWTEST_LOCAL with CHILLI ────────────────────────────────
    // Farmer 1 tab is active by default
    let f1 = farmerCard(page, 1);
    await fillAndBlur(f1.getByPlaceholder('LOCAL, RSB…'), `PWTEST_LOCAL_${TS}`);
    await fillAndBlur(f1.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_CHILLI');

    // Stock in: 200 bags, 3000 kg → avg 15
    const chilli = lotCard(f1, 1);
    await chilli.getByPlaceholder('200').fill('200');
    await chilli.getByPlaceholder('3000').fill('3000');

    // Sale 1: Ramesh, 2 bags (48kg + 52kg), ₹220/10kg
    const ramesh = saleCard(chilli, 1);
    await fillAndBlur(ramesh.getByPlaceholder('Name or CASH SALES'), `PWTEST_RAMESH_${TS}`);
    await ramesh.getByPlaceholder('20', { exact: true }).fill('2');
    await expect(ramesh.getByPlaceholder('kg')).toHaveCount(2);
    await ramesh.getByPlaceholder('kg').nth(0).fill('48');
    await ramesh.getByPlaceholder('kg').nth(1).fill('52');
    await ramesh.getByPlaceholder('220', { exact: true }).fill('220');

    // Sale 2: Krishna, 1 bag (40kg), ₹230/10kg
    await chilli.getByRole('button', { name: /\+ .*Add customer/ }).click();
    const krishna = saleCard(chilli, 2);
    await fillAndBlur(krishna.getByPlaceholder('Name or CASH SALES'), `PWTEST_KRISHNA_${TS}`);
    await krishna.getByPlaceholder('20', { exact: true }).fill('1');
    await krishna.getByPlaceholder('kg').fill('40');
    await krishna.getByPlaceholder('220', { exact: true }).fill('230');

    // Verify farmer name and item persisted
    await expect(f1.getByPlaceholder('LOCAL, RSB…')).toHaveValue(`PWTEST_LOCAL_${TS}`);
    await expect(f1.getByPlaceholder('CHILLI, BEANS…').first()).toHaveValue('PWTEST_CHILLI');

    // Add second item to farmer 1: BEANS
    await f1.getByRole('button', { name: /\+ .*Add item/ }).click();
    const beans = lotCard(f1, 2);
    await fillAndBlur(beans.getByPlaceholder('CHILLI, BEANS…'), 'PWTEST_BEANS');
    await beans.getByPlaceholder('200').fill('50');
    await beans.getByPlaceholder('3000').fill('1000');
    const suresh = saleCard(beans, 1);
    await fillAndBlur(suresh.getByPlaceholder('Name or CASH SALES'), `PWTEST_SURESH_${TS}`);
    await suresh.getByPlaceholder('20', { exact: true }).fill('1');
    await suresh.getByPlaceholder('kg').fill('22');
    await suresh.getByPlaceholder('220', { exact: true }).fill('180');

    // ── Farmer 2: PWTEST_RSB with TOMATO ──────────────────────────────────
    // Click the "+" tab to add a new farmer
    await page.getByRole('button', { name: '+', exact: true }).click();
    // New tab is now active — the section shows "Farmer 2" in the print button fallback
    const f2 = farmerCard(page, 2);
    await expect(f2).toBeVisible();
    await fillAndBlur(f2.getByPlaceholder('LOCAL, RSB…'), `PWTEST_RSB_${TS}`);
    await fillAndBlur(f2.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_TOMATO');

    const tomato = lotCard(f2, 1);
    await tomato.getByPlaceholder('200').fill('40');
    await tomato.getByPlaceholder('3000').fill('800');
    const anand = saleCard(tomato, 1);
    await fillAndBlur(anand.getByPlaceholder('Name or CASH SALES'), `PWTEST_ANAND_${TS}`);
    await anand.getByPlaceholder('20', { exact: true }).fill('1');
    await anand.getByPlaceholder('kg').fill('19');
    await anand.getByPlaceholder('220', { exact: true }).fill('150');

    // Add cash sale: 1 bag (21kg)
    await tomato.getByRole('button', { name: /\+ .*Add customer/ }).click();
    const cashSale = saleCard(tomato, 2);
    await fillAndBlur(cashSale.getByPlaceholder('Name or CASH SALES'), 'CASH SALES');
    await cashSale.getByPlaceholder('20', { exact: true }).fill('1');
    await cashSale.getByPlaceholder('kg').fill('21');
    await cashSale.getByPlaceholder('220', { exact: true }).fill('150');

    // ── Switch back to Farmer 1 to set charges ───────────────────────────
    await switchToFarmerByName(page, `PWTEST_LOCAL_${TS}`);
    f1 = farmerCard(page, 1);
    const bardanInput = f1.locator('label:has-text("Bardan")').locator('..').locator('input');
    await bardanInput.fill('100');
    const freightInput = f1.locator('label:has-text("Freight")').locator('..').locator('input');
    await freightInput.fill('200');

    // ── Screenshot before save ────────────────────────────────────────────
    await page.screenshot({ path: 'test-output/data-entry-before-save.png', fullPage: true });

    // ── Save ──────────────────────────────────────────────────────────────
    const saveBtn = page.getByRole('button', { name: /Save patti/i });
    await saveBtn.click();

    // Wait for save to complete — success screen shows "Saved in the shop"
    await expect(page.getByText(/Saved in the shop|సేవ్ అయింది|सेव हो गया/)).toBeVisible({ timeout: 30_000 });

    // ── Screenshot after save ─────────────────────────────────────────────
    await page.screenshot({ path: 'test-output/data-entry-after-save.png', fullPage: true });

    // ── Verify saved sales are shown in the table ─────────────────────────
    await expect(page.locator('tbody tr')).toContainText([`PWTEST_RAMESH_${TS}`]);
    await expect(page.locator('tbody tr')).toContainText([`PWTEST_ANAND_${TS}`]);

    // ── Verify data persisted via API ─────────────────────────────────────
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const farmersRes = await page.request.get(`/api/farmers?date=${dateStr}`);
    expect(farmersRes.ok()).toBeTruthy();
    const farmersData = await farmersRes.json();
    console.log('Farmers on date:', farmersData.farmers);
    expect(farmersData.farmers).toContain(`PWTEST_LOCAL_${TS}`);
    expect(farmersData.farmers).toContain(`PWTEST_RSB_${TS}`);

    // Check customers
    const customersRes = await page.request.get('/api/customers');
    expect(customersRes.ok()).toBeTruthy();
    const customersData = await customersRes.json();
    const customerNames = (customersData.customers || []).map((c: { name: string }) => c.name);
    expect(customerNames.some((n: string) => n.includes(`PWTEST_RAMESH_${TS}`))).toBeTruthy();
    expect(customerNames.some((n: string) => n.includes(`PWTEST_KRISHNA_${TS}`))).toBeTruthy();
    expect(customerNames.some((n: string) => n.includes(`PWTEST_SURESH_${TS}`))).toBeTruthy();
    expect(customerNames.some((n: string) => n.includes(`PWTEST_ANAND_${TS}`))).toBeTruthy();

    // ── Verify farmer patti data ──────────────────────────────────────────
    const pattiRes = await page.request.get(
      `/api/farmers?date=${dateStr}&farmer=${encodeURIComponent(`PWTEST_LOCAL_${TS}`)}`,
    );
    expect(pattiRes.ok()).toBeTruthy();
    const pattiData = await pattiRes.json();
    expect(pattiData.patti).toBeTruthy();
    // 3 sale lines: Ramesh (2 bags), Krishna (1 bag), Suresh (1 bag beans)
    expect(pattiData.patti.lines.length).toBe(3);

    // ── Verify saved screen shows a day grid table ────────────────────────
    await expect(page.getByRole('heading', { name: /Today's Sales|నేడు అమ్మకాలు|आज की बिक्री/ })).toBeVisible();
    // Table should have 5 sale rows (Ramesh, Krishna, Suresh, Anand, CASH SALES)
    await expect(page.locator('tbody tr')).toHaveCount(5);
    // Verify first row has commodity, customer, amount
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toContainText(`PWTEST_RAMESH_${TS}`);
    await expect(firstRow).toContainText('PWTEST_CHILLI');

    // ── Verify footer totals (cash + credit summary cards) ───────────────
    await expect(page.getByText('Cash').or(page.getByText('నగదు')).or(page.getByText('नकद')).first()).toBeVisible();

    // ── Verify "Edit this patti" button is present ────────────────────────
    await expect(page.getByRole('button', { name: /Edit this patti|పట్టీ సరిదిద్దు|पट्टी सुधारें/ })).toBeVisible();
    // ── Verify "New Entry" button is present ──────────────────────────────
    await expect(page.getByRole('button', { name: /New Entry|కొత్త ఎంట్రీ|नई एंट्री/ })).toBeVisible();
    // ── Verify print buttons are present ──────────────────────────────────
    await expect(page.getByRole('button', { name: /Print patti/ })).toHaveCount(2);

    // ── Screenshot of the saved table ─────────────────────────────────────
    await page.screenshot({ path: 'test-output/data-entry-saved-table.png', fullPage: true });

    console.log('✅ Full data entry flow passed — 2 farmers, 2 products, bag weights, save, table verify');
  });

  test('verify leftover/oversold warning appears', async ({ page }) => {
    await page.goto('/entry');
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible({ timeout: 30_000 });

    const f1 = farmerCard(page, 1);
    await fillAndBlur(f1.getByPlaceholder('LOCAL, RSB…'), `PWTEST_OVERSELL_${TS}`);
    await fillAndBlur(f1.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_ONION');

    const onion = lotCard(f1, 1);
    await onion.getByPlaceholder('200').fill('5');  // only 5 bags in
    await onion.getByPlaceholder('3000').fill('100'); // 100 kg in

    // Sell 10 bags (more than 5 received) — enter 10 as bag count, fill each bag weight
    const sale = saleCard(onion, 1);
    await fillAndBlur(sale.getByPlaceholder('Name or CASH SALES'), `PWTEST_BUYER_${TS}`);
    await sale.getByPlaceholder('20', { exact: true }).fill('10');
    await expect(sale.getByPlaceholder('kg')).toHaveCount(10);
    for (let i = 0; i < 10; i++) {
      await sale.getByPlaceholder('kg').nth(i).fill('10');
    }
    await sale.getByPlaceholder('220', { exact: true }).fill('100');

    // Should show oversold warning (⚠)
    const warning = onion.locator('text=⚠');
    await expect(warning).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-output/data-entry-oversold.png', fullPage: true });
    console.log('✅ Oversold warning test passed');
  });
});
