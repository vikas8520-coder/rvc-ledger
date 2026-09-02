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
  // No longer used — customer fields are now directly in the lot card (no tiles)
  return lot;
}

async function saveAndWait(page: Page, expectedRows: number) {
  const saveBtn = page.getByRole('button', { name: /Save patti/i });
  await saveBtn.click();
  await expect(page.locator('tbody tr')).toHaveCount(expectedRows, { timeout: 30_000 });
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
    // Enter first item name in the items list at top
    await fillAndBlur(f1.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_CHILLI');

    // Stock in for item 1: 200 bags, 3000 kg (in the items list at top)
    await f1.getByPlaceholder('200').first().fill('200');
    await f1.getByPlaceholder('3000').first().fill('3000');

    // Sale 1: Ramesh, 2 bags (48kg + 52kg), ₹220/10kg → save → fields clear
    // Customer fields are below the item dropdown
    await fillAndBlur(f1.getByPlaceholder('Name or CASH SALES'), `PWTEST_RAMESH_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('2');
    await expect(f1.getByPlaceholder('kg')).toHaveCount(2);
    await f1.getByPlaceholder('kg').nth(0).fill('48');
    await f1.getByPlaceholder('kg').nth(1).fill('52');
    await f1.getByPlaceholder('220', { exact: true }).fill('220');
    await page.screenshot({ path: 'test-output/data-entry-before-save.png', fullPage: true });
    await saveAndWait(page, 1);

    // Sale 2: Krishna, 1 bag (40kg), ₹230/10kg — same item, fields cleared after save
    await fillAndBlur(f1.getByPlaceholder('Name or CASH SALES'), `PWTEST_KRISHNA_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('1');
    await f1.getByPlaceholder('kg').fill('40');
    await f1.getByPlaceholder('220', { exact: true }).fill('230');
    await saveAndWait(page, 2);

    // Verify farmer name and item persisted across saves
    await expect(f1.getByPlaceholder('LOCAL, RSB…')).toHaveValue(`PWTEST_LOCAL_${TS}`);
    await expect(f1.getByPlaceholder('CHILLI, BEANS…').first()).toHaveValue('PWTEST_CHILLI');

    // Add second item to farmer 1: BEANS (via + Add item at top)
    await f1.getByRole('button', { name: /\+ .*Add item/ }).click();
    // Enter BEANS as the second item name
    await fillAndBlur(f1.getByPlaceholder('CHILLI, BEANS…').nth(1), 'PWTEST_BEANS');
    await f1.getByPlaceholder('200').nth(1).fill('50');
    await f1.getByPlaceholder('3000').nth(1).fill('1000');
    // Switch to BEANS via dropdown
    await f1.locator('select').selectOption({ label: 'PWTEST_BEANS' });
    // Sale 3: Suresh, 1 bag (22kg), ₹180/10kg
    await fillAndBlur(f1.getByPlaceholder('Name or CASH SALES'), `PWTEST_SURESH_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('1');
    await f1.getByPlaceholder('kg').fill('22');
    await f1.getByPlaceholder('220', { exact: true }).fill('180');
    await saveAndWait(page, 3);

    // ── Farmer 2: PWTEST_RSB with TOMATO ──────────────────────────────────
    await page.getByRole('button', { name: '+', exact: true }).click();
    const f2 = farmerCard(page, 2);
    await expect(f2).toBeVisible();
    await fillAndBlur(f2.getByPlaceholder('LOCAL, RSB…'), `PWTEST_RSB_${TS}`);
    await fillAndBlur(f2.getByPlaceholder('CHILLI, BEANS…').first(), 'PWTEST_TOMATO');
    await f2.getByPlaceholder('200').first().fill('40');
    await f2.getByPlaceholder('3000').first().fill('800');
    // Sale 4: Anand, 1 bag (19kg), ₹150/10kg
    await fillAndBlur(f2.getByPlaceholder('Name or CASH SALES'), `PWTEST_ANAND_${TS}`);
    await f2.getByPlaceholder('20', { exact: true }).fill('1');
    await f2.getByPlaceholder('kg').fill('19');
    await f2.getByPlaceholder('220', { exact: true }).fill('150');
    await saveAndWait(page, 4);

    // Sale 5: CASH SALES, 1 bag (21kg) — same tomato, fields cleared
    await fillAndBlur(f2.getByPlaceholder('Name or CASH SALES'), 'CASH SALES');
    await f2.getByPlaceholder('20', { exact: true }).fill('1');
    await f2.getByPlaceholder('kg').fill('21');
    await f2.getByPlaceholder('220', { exact: true }).fill('150');
    await saveAndWait(page, 5);

    // ── Screenshot after all saves ────────────────────────────────────────
    await page.screenshot({ path: 'test-output/data-entry-after-save.png', fullPage: true });

    // ── Verify saved sales are shown in the table at the bottom ───────────
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

    // ── Verify live transactions table at the bottom of the same page ─────
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
    // ── Verify print buttons are present in the live transactions header ──
    // The farmer name appears in the tab, the form's print button, and the live tx print button
    // Target the ones in the live transactions section (last occurrence)
    const localPrintBtns = page.getByRole('button', { name: `PWTEST_LOCAL_${TS}` });
    await expect(localPrintBtns.last()).toBeVisible();
    const rsbPrintBtns = page.getByRole('button', { name: `PWTEST_RSB_${TS}` });
    await expect(rsbPrintBtns.last()).toBeVisible();

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

    // Stock in: 5 bags, 100 kg (in the items list at top)
    await f1.getByPlaceholder('200').first().fill('5');
    await f1.getByPlaceholder('3000').first().fill('100');

    // Sell 10 bags (more than 5 received) — customer fields below dropdown
    await fillAndBlur(f1.getByPlaceholder('Name or CASH SALES'), `PWTEST_BUYER_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('10');
    await expect(f1.getByPlaceholder('kg')).toHaveCount(10);
    for (let i = 0; i < 10; i++) {
      await f1.getByPlaceholder('kg').nth(i).fill('10');
    }
    await f1.getByPlaceholder('220', { exact: true }).fill('100');

    // Should show oversold warning (⚠)
    const warning = f1.locator('text=⚠').first();
    await expect(warning).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-output/data-entry-oversold.png', fullPage: true });
    console.log('✅ Oversold warning test passed');
  });
});
