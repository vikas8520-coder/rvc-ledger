import { test, expect, type Page, type Locator } from '@playwright/test';

const TS = Date.now();

// ─── Helpers ───────────────────────────────────────────────────────────────

async function fillAndBlur(input: Locator, value: string) {
  await input.fill(value);
  await input.press('Escape').catch(() => {});
}

function farmerCard(page: Page, n: number): Locator {
  // The active farmer's section is the only visible <section> on the page.
  return page.locator('section').first();
}

async function addItem(farmer: Locator, name: string) {
  const input = farmer.getByPlaceholder('+ item name…');
  await input.fill(name);
  await input.press('Enter');
}

// Click the item chip to open the stock popover, then fill bags + kg
async function fillStock(farmer: Locator, itemName: string, bags: string, kg: string) {
  // Click the chip button showing the item name
  await farmer.getByRole('button', { name: itemName, exact: true }).click();
  // Stock popover opens — fill bags and kg
  await farmer.getByPlaceholder('200', { exact: true }).fill(bags);
  await farmer.getByPlaceholder('3000', { exact: true }).fill(kg);
  // Close popover by clicking the ✕ inside it
  await farmer.locator('.fixed.inset-0.z-40').click();
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
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible({ timeout: 30_000 });

    // ── Farmer 1: PWTEST_LOCAL with CHILLI + BEANS ────────────────────────
    let f1 = farmerCard(page, 1);
    await fillAndBlur(f1.getByPlaceholder('LOCAL, RSB…'), `PWTEST_LOCAL_${TS}`);

    // Add first item: CHILLI
    await addItem(f1, 'PWTEST_CHILLI');
    // Stock in for CHILLI: 200 bags, 3000 kg (via popover)
    await fillStock(f1, 'PWTEST_CHILLI', '200', '3000');

    // Sale 1: Ramesh, 2 bags (48kg + 52kg), ₹220/10kg → save → fields clear
    await fillAndBlur(f1.getByPlaceholder('Name or CASH'), `PWTEST_RAMESH_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('2');
    // Per-bag weight inputs appear (placeholder is bag number: "1", "2")
    await f1.getByPlaceholder('1', { exact: true }).fill('48');
    await f1.getByPlaceholder('2', { exact: true }).fill('52');
    await f1.getByPlaceholder('220', { exact: true }).fill('220');
    await saveAndWait(page, 1);

    // Sale 2: Krishna, 1 bag (40kg), ₹230/10kg — same item, fields cleared
    await fillAndBlur(f1.getByPlaceholder('Name or CASH'), `PWTEST_KRISHNA_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('1');
    await f1.getByPlaceholder('1', { exact: true }).fill('40');
    await f1.getByPlaceholder('220', { exact: true }).fill('230');
    await saveAndWait(page, 2);

    // Add second item: BEANS
    await addItem(f1, 'PWTEST_BEANS');
    // Stock in for BEANS: 50 bags, 1000 kg (via popover)
    await fillStock(f1, 'PWTEST_BEANS', '50', '1000');

    // Sale 3: Suresh, 1 bag (22kg), ₹180/10kg — on BEANS
    await fillAndBlur(f1.getByPlaceholder('Name or CASH'), `PWTEST_SURESH_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('1');
    await f1.getByPlaceholder('1', { exact: true }).fill('22');
    await f1.getByPlaceholder('220', { exact: true }).fill('180');
    await saveAndWait(page, 3);

    // ── Farmer 2: PWTEST_RSB with TOMATO ──────────────────────────────────
    await page.getByRole('button', { name: '+', exact: true }).click();
    const f2 = farmerCard(page, 2);
    await expect(f2).toBeVisible();
    await fillAndBlur(f2.getByPlaceholder('LOCAL, RSB…'), `PWTEST_RSB_${TS}`);

    // Add item: TOMATO
    await addItem(f2, 'PWTEST_TOMATO');
    await fillStock(f2, 'PWTEST_TOMATO', '40', '800');

    // Sale 4: Anand, 1 bag (19kg), ₹150/10kg
    await fillAndBlur(f2.getByPlaceholder('Name or CASH'), `PWTEST_ANAND_${TS}`);
    await f2.getByPlaceholder('20', { exact: true }).fill('1');
    await f2.getByPlaceholder('1', { exact: true }).fill('19');
    await f2.getByPlaceholder('220', { exact: true }).fill('150');
    await saveAndWait(page, 4);

    // Sale 5: CASH SALES, 1 bag (21kg) — same tomato
    await fillAndBlur(f2.getByPlaceholder('Name or CASH'), 'CASH SALES');
    await f2.getByPlaceholder('20', { exact: true }).fill('1');
    await f2.getByPlaceholder('1', { exact: true }).fill('21');
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

    // ── Verify live transactions table at the bottom ──────────────────────
    await expect(page.getByRole('heading', { name: /Today's Sales|నేడు అమ్మకాలు|आज की बिक्री/ })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toContainText(`PWTEST_RAMESH_${TS}`);
    await expect(firstRow).toContainText('PWTEST_CHILLI');

    // ── Verify footer totals ──────────────────────────────────────────────
    await expect(page.getByText('Cash').or(page.getByText('నగదు')).or(page.getByText('नकद')).first()).toBeVisible();

    // ── Verify edit / new entry buttons ───────────────────────────────────
    await expect(page.getByRole('button', { name: /Edit this patti|పట్టీ సరిదిద్దు|पट्टी सुधारें/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /New Entry|కొత్త ఎంట్రీ|नई एंट्री/ })).toBeVisible();

    // ── Verify print buttons ──────────────────────────────────────────────
    const localPrintBtns = page.getByRole('button', { name: `PWTEST_LOCAL_${TS}` });
    await expect(localPrintBtns.last()).toBeVisible();
    const rsbPrintBtns = page.getByRole('button', { name: `PWTEST_RSB_${TS}` });
    await expect(rsbPrintBtns.last()).toBeVisible();

    await page.screenshot({ path: 'test-output/data-entry-saved-table.png', fullPage: true });

    console.log('✅ Full data entry flow passed — 2 farmers, 3 products, bag weights, save, table verify');
  });

  test('verify leftover/oversold warning appears', async ({ page }) => {
    await page.goto('/entry');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Patti Book' })).toBeVisible({ timeout: 30_000 });

    const f1 = farmerCard(page, 1);
    await fillAndBlur(f1.getByPlaceholder('LOCAL, RSB…'), `PWTEST_OVERSELL_${TS}`);

    // Add item: ONION
    await addItem(f1, 'PWTEST_ONION');
    // Stock in: 5 bags, 100 kg (via popover)
    await fillStock(f1, 'PWTEST_ONION', '5', '100');

    // Sell 10 bags (more than 5 received)
    await fillAndBlur(f1.getByPlaceholder('Name or CASH'), `PWTEST_BUYER_${TS}`);
    await f1.getByPlaceholder('20', { exact: true }).fill('10');
    // 10 per-bag weight inputs appear
    for (let i = 0; i < 10; i++) {
      await f1.getByPlaceholder(String(i + 1), { exact: true }).fill('10');
    }
    await f1.getByPlaceholder('220', { exact: true }).fill('100');

    // Should show oversold warning (⚠)
    const warning = f1.locator('text=⚠').first();
    await expect(warning).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'test-output/data-entry-oversold.png', fullPage: true });
    console.log('✅ Oversold warning test passed');
  });
});
