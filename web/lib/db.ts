import { randomUUID, createHash, randomBytes } from 'crypto';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { Customer, BillData, BillItem, TxnView, PurchaseData, PurchaseView, Supplier, WastageEntry, CatalogItem, StockLevel, ExpenseEntry, DailySummary, ItemRateHistory, ItemRateEntry, OverdueCustomer } from './types';
import { decodeMarketNotes, encodeMarketNotes, detectCharge, parseDisplay, type ChargeKind } from './market';
import seed from '../data/seed.json';

const databaseUrl = process.env.DATABASE_URL;

let sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured. Check Vercel/Neon integration.');
  }
  if (!sql) {
    sql = neon(databaseUrl);
  }
  return sql;
}

export function isDbConfigured(): boolean {
  return !!databaseUrl;
}

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady || !isDbConfigured()) return;
  const sql = getSql();
  await sql`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'item'`;
  await sql`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS charge_code TEXT`;
  await sql`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS farmer TEXT`;
  await sql`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS hamali NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS bags NUMERIC(10,2) DEFAULT 0`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS english_name TEXT`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS telugu_name TEXT`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS hindi_name TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL,
      supplier TEXT,
      bill_no TEXT,
      total NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
      name TEXT,
      qty TEXT,
      rate TEXT,
      amount NUMERIC(12,2) DEFAULT 0,
      kind TEXT DEFAULT 'item',
      charge_code TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS wastage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL,
      item_name TEXT NOT NULL,
      qty TEXT,
      unit TEXT,
      reason TEXT,
      est_cost NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS catalog_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      shop_id UUID,
      default_unit TEXT,
      default_sell_price NUMERIC(12,2),
      telugu_name TEXT,
      hindi_name TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (shop_id, name)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS catalog_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id UUID REFERENCES catalog_items(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      amount NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2)`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'credit'`;
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // ---- Multi-tenant schema ----
  await sql`
    CREATE TABLE IF NOT EXISTS shops (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      active BOOLEAN DEFAULT true,
      billing_status TEXT DEFAULT 'trial',
      trial_ends DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`ALTER TABLE shops ADD COLUMN IF NOT EXISTS data_entry_password TEXT DEFAULT NULL`;
  await sql`ALTER TABLE shops ADD COLUMN IF NOT EXISTS shop_number TEXT DEFAULT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS shop_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id TEXT UNIQUE NOT NULL,
      shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner',
      profile TEXT NOT NULL DEFAULT 'owner',
      name TEXT,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`ALTER TABLE shop_users ADD COLUMN IF NOT EXISTS profile TEXT NOT NULL DEFAULT 'owner'`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT NULL`;
  await sql`ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE wastage ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS shop_id UUID`;
  // Migrate from global UNIQUE(name) to tenant-scoped UNIQUE(shop_id, name)
  // so multiple shops can each have their own "Tomato", "Onion", etc.
  await sql`ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_name_key`;
  await sql`DROP INDEX IF EXISTS catalog_items_name_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_shop_id_name_key ON catalog_items (shop_id, name)`;
  await sql`ALTER TABLE catalog_aliases ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS shop_id UUID`;

  // ---- Self-learning: customer name aliases ----
  await sql`
    CREATE TABLE IF NOT EXISTS customer_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL,
      raw_name TEXT NOT NULL,
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (shop_id, raw_name)
    )
  `;

  // ---- Self-learning: commodity rate history ----
  await sql`
    CREATE TABLE IF NOT EXISTS rate_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL,
      commodity TEXT NOT NULL,
      rate NUMERIC(12,2) NOT NULL,
      rate_unit TEXT DEFAULT 'per_kg',
      date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // ---- Hamali rates (Bowenpally market yard, 2024) ----
  // Stores the official hamali charges per commodity/weight bracket.
  // Total hamali = seller_share + purchaser_share (both deducted from farmer).
  await sql`
    CREATE TABLE IF NOT EXISTS hamali_rates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID,
      sl_no INT NOT NULL,
      label TEXT NOT NULL,
      match_keywords TEXT[] DEFAULT '{}',
      weight_min_kg NUMERIC DEFAULT NULL,
      weight_max_kg NUMERIC DEFAULT NULL,
      seller_share NUMERIC(10,2) NOT NULL DEFAULT 0,
      purchaser_share NUMERIC(10,2) NOT NULL DEFAULT 0,
      unit TEXT DEFAULT 'per_bag',
      sort_order INT DEFAULT 0
    )
  `;

  // ---- Financial year opening balances ----
  await sql`
    CREATE TABLE IF NOT EXISTS fy_opening_balances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      fy_start_year INT NOT NULL,
      opening_balance NUMERIC(14,2) DEFAULT 0,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (shop_id, customer_id, fy_start_year)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_fy_balances_shop ON fy_opening_balances(shop_id, fy_start_year)`;

  // ---- Subscription payments ----
  await sql`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      plan TEXT NOT NULL DEFAULT 'single',
      covers_from DATE NOT NULL,
      covers_to DATE NOT NULL,
      notes TEXT,
      recorded_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sub_payments_shop ON subscription_payments(shop_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sub_payments_date ON subscription_payments(payment_date DESC)`;

  schemaReady = true;
}

// ---- Financial year helpers ----

// Returns the current date in IST (Asia/Kolkata) as YYYY-MM-DD.
// The app's users are all in India; using UTC date causes a 5.5-hour
// mismatch between midnight and 5:30 AM IST where the "today" is wrong.
export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Indian FY: April 1 to March 31. Month index 0-based: April = 3.
// If current month is Jan-Mar (0-2), we're in FY that started last year.
// Uses IST to determine the current date — on the server, new Date() is UTC,
// which would give the wrong FY between midnight and 5:30 AM IST on April 1.
export function currentFYStartYear(d?: Date): number {
  if (!d) {
    // Use IST date parts to avoid UTC mismatch on April 1 boundary
    const istStr = istToday(); // YYYY-MM-DD
    const [y, m] = istStr.split('-').map(Number);
    return m >= 4 ? y : y - 1;
  }
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyDateRange(fyStartYear: number): { from: string; to: string } {
  return {
    from: `${fyStartYear}-04-01`,
    to: `${fyStartYear + 1}-03-31`,
  };
}

// Calculate opening balance for a customer at the start of a FY.
// opening = SUM(bills before April 1) - SUM(payments before April 1)
// Excludes CASH SALES (cash sales are settled immediately, no credit balance).
async function calcOpeningBalance(
  sql: ReturnType<typeof getSql>,
  shopId: string,
  customerId: string,
  fyStartYear: number
): Promise<number> {
  const fyStart = `${fyStartYear}-04-01`;
  const [row] = await sql`
    SELECT
      COALESCE(SUM(t.bill_amount), 0) - COALESCE(SUM(t.amount_paid), 0) as balance
    FROM transactions t
    WHERE t.customer_id = ${customerId}
      AND t.shop_id = ${shopId}
      AND t.date < ${fyStart}
  `;
  return Number((row as any)?.balance ?? 0);
}

// Get the opening balance for a customer in a FY.
// Uses stored value if available (fast), otherwise calculates on the fly (fallback).
export async function getFYOpeningBalance(
  shopId: string,
  customerId: string,
  fyStartYear: number
): Promise<number> {
  if (!isDbConfigured()) return 0;
  await ensureSchema();
  const sql = getSql();
  const [stored] = await sql`
    SELECT opening_balance FROM fy_opening_balances
    WHERE shop_id = ${shopId} AND customer_id = ${customerId} AND fy_start_year = ${fyStartYear}
  `;
  if (stored) return Number((stored as any).opening_balance);
  // Fallback: calculate on the fly
  return calcOpeningBalance(sql, shopId, customerId, fyStartYear);
}

// Batch-fetch opening balances for ALL customers in one go.
// Returns a Map<customerId, openingBalance>. Avoids N+1 queries.
// Uses stored values where available, calculates on-the-fly for the rest.
// Single query using LEFT JOIN + correlated subquery.
async function getFYOpeningBalancesBatch(
  sql: ReturnType<typeof getSql>,
  shopId: string,
  customerIds: string[],
  fyStartYear: number
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (customerIds.length === 0) return result;

  const fyStart = `${fyStartYear}-04-01`;

  // Single query: LEFT JOIN stored balances, fallback to calculated from transactions
  const rows = await sql`
    SELECT c.id as customer_id,
           COALESCE(fob.opening_balance,
             COALESCE((
               SELECT COALESCE(SUM(t.bill_amount), 0) - COALESCE(SUM(t.amount_paid), 0)
               FROM transactions t
               WHERE t.customer_id = c.id AND t.shop_id = ${shopId} AND t.date < ${fyStart}
             ), 0)
           ) as opening_balance
    FROM UNNEST(${customerIds}::uuid[]) AS c(id)
    LEFT JOIN fy_opening_balances fob
      ON fob.customer_id = c.id AND fob.shop_id = ${shopId} AND fob.fy_start_year = ${fyStartYear}
  `;

  for (const r of rows as any[]) {
    result.set(r.customer_id as string, Number(r.opening_balance));
  }
  return result;
}

// Close a financial year for a shop.
// Stores opening balances for all customers for the NEXT FY.
// Idempotent: safe to re-run, updates existing balances.
export async function closeFY(shopId: string, fyStartYear: number): Promise<{ customersClosed: number }> {
  if (!isDbConfigured()) return { customersClosed: 0 };
  await ensureSchema();
  const sql = getSql();
  const nextFY = fyStartYear + 1;
  const { from, to } = fyDateRange(fyStartYear);

  // Get all customers for this shop (excluding CASH SALES)
  const customers = await sql`
    SELECT id FROM customers WHERE shop_id = ${shopId} AND name != 'CASH SALES'
  `;
  const customerIds = (customers as any[]).map((c) => c.id as string);
  if (customerIds.length === 0) return { customersClosed: 0 };

  // Batch: opening balances (2 queries)
  const openingBalances = await getFYOpeningBalancesBatch(sql, shopId, customerIds, fyStartYear);

  // Batch: FY totals per customer (1 query)
  const fyTotalsRows = await sql`
    SELECT customer_id,
           COALESCE(SUM(bill_amount), 0) as billed,
           COALESCE(SUM(amount_paid), 0) as paid
    FROM transactions
    WHERE shop_id = ${shopId}
      AND date >= ${from} AND date <= ${to}
      AND customer_id = ANY(${customerIds}::uuid[])
    GROUP BY customer_id
  `;
  const fyTotalsMap = new Map<string, { billed: number; paid: number }>();
  for (const r of fyTotalsRows as any[]) {
    fyTotalsMap.set(r.customer_id as string, { billed: Number(r.billed), paid: Number(r.paid) });
  }

  // Batch upsert: build values array, insert in one query
  const values = customerIds.map((id) => {
    const opening = openingBalances.get(id) ?? 0;
    const totals = fyTotalsMap.get(id);
    const closing = opening + (totals?.billed ?? 0) - (totals?.paid ?? 0);
    return { id, closing };
  });

  // Use UNNEST for batch upsert (single query instead of N)
  const ids = values.map((v) => v.id);
  const closings = values.map((v) => v.closing);
  await sql`
    INSERT INTO fy_opening_balances (shop_id, customer_id, fy_start_year, opening_balance, closed_at)
    SELECT ${shopId}, id, ${nextFY}, closing, now()
    FROM UNNEST(${ids}::uuid[], ${closings}::numeric[]) AS t(id, closing)
    ON CONFLICT (shop_id, customer_id, fy_start_year)
    DO UPDATE SET opening_balance = EXCLUDED.opening_balance, closed_at = now()
  `;

  return { customersClosed: customerIds.length };
}

// Cache: avoid re-checking autoCloseFY on every request (per shop per FY)
const autoCloseChecked = new Set<string>(); // key: `${shopId}:${currentFY}`

// Auto-close previous FY if it hasn't been closed yet.
// Called on dashboard load. No-op if already closed or if we're still in the same FY.
export async function autoCloseFY(shopId: string): Promise<{ closed: boolean; fyStartYear: number | null }> {
  if (!isDbConfigured()) return { closed: false, fyStartYear: null };
  await ensureSchema();
  const sql = getSql();

  const currentFY = currentFYStartYear();
  const previousFY = currentFY - 1;

  // Cache: if we've already checked this shop+FY in this process, skip
  const cacheKey = `${shopId}:${currentFY}`;
  if (autoCloseChecked.has(cacheKey)) {
    return { closed: false, fyStartYear: null };
  }

  // Combine both checks into a single query (avoid 2 sequential round-trips)
  const { from, to } = fyDateRange(previousFY);
  const [check] = await sql`
    SELECT
      (SELECT COUNT(*) FROM fy_opening_balances
       WHERE shop_id = ${shopId} AND fy_start_year = ${currentFY}) as closed_count,
      (SELECT COUNT(*) FROM transactions
       WHERE shop_id = ${shopId} AND date >= ${from} AND date <= ${to}) as prev_fy_txns
  `;
  const closedCount = Number((check as any)?.closed_count ?? 0);
  const prevFyTxns = Number((check as any)?.prev_fy_txns ?? 0);

  // Mark as checked (cache for subsequent calls in this process)
  autoCloseChecked.add(cacheKey);

  if (closedCount > 0) {
    return { closed: false, fyStartYear: null };
  }
  if (prevFyTxns === 0) {
    return { closed: false, fyStartYear: null };
  }

  await closeFY(shopId, previousFY);
  return { closed: true, fyStartYear: previousFY };
}

// Recalculate opening balances for a FY and all subsequent FYs.
// Called when a backdated transaction is entered that affects a closed FY.
export async function recalcFYBalances(shopId: string, affectedFYStartYear: number): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const sql = getSql();
  const currentFY = currentFYStartYear();

  // Get all customers with transactions (once, outside the FY loop)
  const customers = await sql`
    SELECT DISTINCT customer_id FROM transactions
    WHERE shop_id = ${shopId} AND customer_id IS NOT NULL
  `;
  const customerIds = (customers as any[]).map((c) => c.customer_id as string);
  if (customerIds.length === 0) return;

  // Recalculate from the affected FY up to the current FY
  for (let fy = affectedFYStartYear; fy <= currentFY; fy++) {
    // Batch: calculate opening balances for all customers at once
    const openingBalances = await getFYOpeningBalancesBatch(sql, shopId, customerIds, fy);

    // Batch upsert using UNNEST
    const ids = customerIds;
    const openings = customerIds.map((id) => openingBalances.get(id) ?? 0);
    await sql`
      INSERT INTO fy_opening_balances (shop_id, customer_id, fy_start_year, opening_balance, closed_at)
      SELECT ${shopId}, id, ${fy}, opening, now()
      FROM UNNEST(${ids}::uuid[], ${openings}::numeric[]) AS t(id, opening)
      ON CONFLICT (shop_id, customer_id, fy_start_year)
      DO UPDATE SET opening_balance = EXCLUDED.opening_balance
    `;
  }
}

// Get FY summary for a shop: total sales, payments, outstanding, commission.
export async function getFYSummary(shopId: string, fyStartYear: number): Promise<{
  totalSales: number;
  totalPayments: number;
  totalOutstanding: number;
  customerCount: number;
}> {
  if (!isDbConfigured()) return { totalSales: 0, totalPayments: 0, totalOutstanding: 0, customerCount: 0 };
  await ensureSchema();
  const sql = getSql();
  const { from, to } = fyDateRange(fyStartYear);

  // Run totals query and customer IDs query in parallel
  const [totalsResult, customersResult] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(CASE WHEN t.bill_amount > 0 AND t.amount_paid >= t.bill_amount THEN t.bill_amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN t.bill_amount > 0 AND t.amount_paid < t.bill_amount THEN t.bill_amount ELSE 0 END), 0) as credit_sales,
        COALESCE(SUM(CASE WHEN t.bill_amount = 0 AND t.amount_paid > 0 THEN t.amount_paid ELSE 0 END), 0) as payments
      FROM transactions t
      WHERE t.shop_id = ${shopId} AND t.date >= ${from} AND t.date <= ${to}
    `,
    sql`
      SELECT id FROM customers WHERE shop_id = ${shopId} AND name != 'CASH SALES'
    `,
  ]);
  const [totals] = totalsResult;
  const customerIds = (customersResult as any[]).map((c) => c.id as string);

  // Run opening balances batch + FY totals in parallel (independent queries)
  const [openingBalances, fyTotalsRows] = await Promise.all([
    getFYOpeningBalancesBatch(sql, shopId, customerIds, fyStartYear),
    sql`
      SELECT customer_id,
             COALESCE(SUM(bill_amount), 0) as billed,
             COALESCE(SUM(amount_paid), 0) as paid
      FROM transactions
      WHERE shop_id = ${shopId}
        AND date >= ${from} AND date <= ${to}
        AND customer_id = ANY(${customerIds}::uuid[])
      GROUP BY customer_id
    `,
  ]);
  const fyTotalsMap = new Map<string, { billed: number; paid: number }>();
  for (const r of fyTotalsRows as any[]) {
    fyTotalsMap.set(r.customer_id as string, {
      billed: Number(r.billed),
      paid: Number(r.paid),
    });
  }

  let totalOutstanding = 0;
  for (const id of customerIds) {
    const opening = openingBalances.get(id) ?? 0;
    const totals = fyTotalsMap.get(id);
    const billed = totals?.billed ?? 0;
    const paid = totals?.paid ?? 0;
    const closing = opening + billed - paid;
    if (closing > 0) totalOutstanding += closing;
  }

  return {
    totalSales: Number((totals as any)?.credit_sales ?? 0) + Number((totals as any)?.cash_sales ?? 0),
    totalPayments: Number((totals as any)?.payments ?? 0),
    totalOutstanding,
    customerCount: customerIds.length,
  };
}

// Get farmer-wise summary for a FY: how much produce sold per farmer, commission, net payable.
export async function getFarmerSummary(shopId: string, fyStartYear: number): Promise<{
  farmer: string;
  phone: string | null;
  totalSales: number;
  totalBags: number;
  totalKgs: number;
  totalHamali: number;
  commission: number;
  netPayable: number;
  lineCount: number;
}[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const { from, to } = fyDateRange(fyStartYear);

  // Get commission % from settings
  const commissionPctStr = await getSetting(shopId, 'commissionPct');
  const commissionPct = commissionPctStr ? Number(commissionPctStr) : 0;

  // Group bill_items by farmer within the FY date range
  // qty is TEXT (from OCR), bags/hamali are NUMERIC — cast qty safely
  const rows = await sql`
    SELECT
      bi.farmer,
      s.phone,
      COALESCE(SUM(bi.amount), 0) as total_sales,
      COALESCE(SUM(COALESCE(bi.bags, 0)), 0) as total_bags,
      COALESCE(SUM(
        CASE
          WHEN bi.qty ~ '^[0-9]+\.?[0-9]*$' THEN bi.qty::numeric
          WHEN substring(bi.qty from '[0-9]+[.]?[0-9]*') IS NOT NULL
            THEN substring(bi.qty from '[0-9]+[.]?[0-9]*')::numeric
          ELSE 0
        END
      ), 0) as total_kgs,
      COALESCE(SUM(COALESCE(bi.hamali, 0)), 0) as total_hamali,
      COUNT(*) as line_count
    FROM bill_items bi
    JOIN transactions t ON t.id = bi.transaction_id
    LEFT JOIN suppliers s ON s.name = bi.farmer AND s.shop_id = ${shopId}
    WHERE bi.shop_id = ${shopId}
      AND bi.farmer IS NOT NULL AND bi.farmer != ''
      AND t.date >= ${from} AND t.date <= ${to}
      AND (bi.kind = 'item' OR bi.kind IS NULL)
    GROUP BY bi.farmer, s.phone
    ORDER BY total_sales DESC
  `;

  return (rows as any[]).map((r) => {
    const totalSales = Number(r.total_sales);
    const commission = (totalSales * commissionPct) / 100;
    const totalHamali = Number(r.total_hamali);
    // Net payable to farmer = sales - commission - hamali (hamali is labor cost deducted from farmer's share)
    const netPayable = totalSales - commission - totalHamali;
    return {
      farmer: r.farmer,
      phone: r.phone || null,
      totalSales,
      totalBags: Number(r.total_bags),
      totalKgs: Number(r.total_kgs),
      totalHamali,
      commission,
      netPayable,
      lineCount: Number(r.line_count),
    };
  });
}

export async function listFarmersOnDate(shopId: string, from: string, to = from): Promise<string[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT bi.farmer
    FROM bill_items bi
    JOIN transactions t ON t.id = bi.transaction_id
    WHERE bi.shop_id = ${shopId}
      AND t.date >= ${from}
      AND t.date <= ${to}
      AND bi.farmer IS NOT NULL AND bi.farmer != ''
      AND (bi.kind = 'item' OR bi.kind IS NULL)
    ORDER BY bi.farmer
  `;
  return (rows as { farmer: string }[]).map((r) => r.farmer);
}

export async function getFarmerPatti(
  shopId: string,
  farmer: string,
  from: string,
  to = from,
): Promise<{
  farmer: string;
  date: string;
  lines: {
    commodity: string;
    qty: string;
    customer: string;
    weight: string;
    rate: string;
    amount: number;
    cash: boolean;
  }[];
  comm: number;
  hamali: number;
} | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const sql = getSql();
  const name = farmer.trim();
  if (!name) return null;

  const rows = await sql`
    SELECT
      c.name as customer_name,
      t.payment_method,
      t.amount_paid,
      t.bill_amount,
      bi.confirmed_name,
      bi.qty,
      bi.rate,
      bi.amount,
      bi.bags,
      bi.hamali
    FROM bill_items bi
    JOIN transactions t ON t.id = bi.transaction_id
    JOIN customers c ON c.id = t.customer_id
    WHERE bi.shop_id = ${shopId}
      AND t.date >= ${from}
      AND t.date <= ${to}
      AND bi.farmer = ${name}
      AND (bi.kind = 'item' OR bi.kind IS NULL)
    ORDER BY t.created_at, bi.created_at
  `;
  if (rows.length === 0) return null;

  const commissionPctStr = await getSetting(shopId, 'commissionPct');
  const commissionPct = commissionPctStr ? Number(commissionPctStr) : 0;

  const lines = (rows as any[]).map((r) => {
    const amount = Number(r.amount || 0);
    const paid = Number(r.amount_paid || 0);
    const billed = Number(r.bill_amount || 0);
    const cash = r.payment_method === 'cash' || (paid > 0 && billed > 0 && paid >= billed);
    return {
      commodity: String(r.confirmed_name || ''),
      qty: r.bags != null && r.bags !== '' ? String(r.bags) : '',
      customer: String(r.customer_name || ''),
      weight: r.qty != null ? String(r.qty) : '',
      rate: r.rate != null ? String(r.rate) : '',
      amount,
      cash,
    };
  });
  const gross = lines.reduce((s, l) => s + l.amount, 0);
  const hamali = (rows as any[]).reduce((s, r) => s + Number(r.hamali || 0), 0);
  return {
    farmer: name,
    date: from === to ? from : `${from} to ${to}`,
    lines,
    comm: (gross * commissionPct) / 100,
    hamali,
  };
}

export async function getFarmerPattiHistory(
  shopId: string,
  farmer: string,
  from?: string,
  to?: string,
): Promise<{
  date: string;
  gross: number;
  bags: number;
  kgs: number;
  hamali: number;
  lineCount: number;
  customers: string[];
}[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const name = farmer.trim();
  if (!name) return [];

  const rows = await sql`
    SELECT
      t.date,
      COALESCE(SUM(bi.amount), 0) as gross,
      COALESCE(SUM(COALESCE(bi.bags, 0)), 0) as bags,
      COALESCE(SUM(
        CASE
          WHEN bi.qty ~ '^[0-9]+\.?[0-9]*$' THEN bi.qty::numeric
          WHEN substring(bi.qty from '[0-9]+[.]?[0-9]*') IS NOT NULL
            THEN substring(bi.qty from '[0-9]+[.]?[0-9]*')::numeric
          ELSE 0
        END
      ), 0) as kgs,
      COALESCE(SUM(COALESCE(bi.hamali, 0)), 0) as hamali,
      COUNT(*) as line_count,
      ARRAY_AGG(DISTINCT c.name) as customers
    FROM bill_items bi
    JOIN transactions t ON t.id = bi.transaction_id
    JOIN customers c ON c.id = t.customer_id
    WHERE bi.shop_id = ${shopId}
      AND bi.farmer = ${name}
      AND (bi.kind = 'item' OR bi.kind IS NULL)
      ${from ? sql`AND t.date >= ${from}` : sql``}
      ${to ? sql`AND t.date <= ${to}` : sql``}
    GROUP BY t.date
    ORDER BY t.date DESC
  `;
  return (rows as any[]).map((r) => ({
    date: toDateOnly(r.date),
    gross: Number(r.gross),
    bags: Number(r.bags),
    kgs: Number(r.kgs),
    hamali: Number(r.hamali),
    lineCount: Number(r.line_count),
    customers: (r.customers || []).filter(Boolean),
  }));
}

function toDateOnly(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value as Date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Store kg as a bare number so farmer totals can SUM(qty). */
export function numericQty(qty: string | null | undefined): string | null {
  if (qty == null) return null;
  const s = String(qty).trim();
  if (!s) return null;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : null;
}

function inferItemKind(it: BillItem & { charge_code?: string | null; kind?: ChargeKind | null }): {
  kind: ChargeKind;
  chargeCode: BillItem['chargeCode'];
} {
  if (it.kind === 'charge' || it.kind === 'item') {
    return { kind: it.kind, chargeCode: it.chargeCode || (it.charge_code as BillItem['chargeCode']) || null };
  }
  const hit = detectCharge(it.confirmed_name || it.raw_text || '');
  if (hit) return { kind: 'charge', chargeCode: hit.code };
  return { kind: 'item', chargeCode: null };
}

function normalizeSeedItems(raw: unknown): Customer['txns'][number]['items'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => {
    if (it && typeof it === 'object' && !Array.isArray(it) && 'name' in it) {
      return it as Customer['txns'][number]['items'][number];
    }
    const [name, display] = Array.isArray(it) ? it : ['', String(it ?? '')];
    const inferred = inferItemKind({
      raw_text: String(name),
      confirmed_name: String(name),
      qty: null,
      rate: null,
      amount: 0,
    });
    return {
      name: String(name),
      qty: null,
      rate: null,
      amount: 0,
      display: String(display ?? ''),
      kind: inferred.kind,
      chargeCode: inferred.chargeCode,
    };
  });
}

/* ---- Shop management ---- */

export async function ensureDefaultShop(): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const existing = await sql`SELECT id FROM shops LIMIT 1`;
  let shopId: string;
  if (existing.length > 0) {
    shopId = (existing[0] as any).id as string;
  } else {
    const [row] = await sql`
      INSERT INTO shops (name) VALUES ('RVC Vegetable Shop') RETURNING id
    `;
    if (!row) throw new Error('Could not create default shop');
    shopId = (row as any).id as string;
  }
  await sql`UPDATE customers SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE transactions SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE bill_items SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE purchases SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE purchase_items SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE suppliers SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE supplier_payments SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE wastage SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE catalog_items SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE catalog_aliases SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE expenses SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  await sql`UPDATE app_settings SET shop_id = ${shopId} WHERE shop_id IS NULL`;
  return shopId;
}

// Link a Clerk user to the default shop (for migrating existing single-shop users)
export async function linkUserToDefaultShop(
  clerkUserId: string,
  email: string,
  name: string,
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const shopId = await ensureDefaultShop();

  // Check if already linked
  const existing = await sql`SELECT id FROM shop_users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`;
  if (existing.length > 0) {
    // Update their shop_id to the default shop
    await sql`UPDATE shop_users SET shop_id = ${shopId}, role = 'owner', profile = 'owner', name = ${name || null}, email = ${email || null} WHERE clerk_user_id = ${clerkUserId}`;
    return shopId;
  }

  await sql`
    INSERT INTO shop_users (clerk_user_id, shop_id, role, profile, name, email)
    VALUES (${clerkUserId}, ${shopId}, 'owner', 'owner', ${name || null}, ${email || null})
  `;
  return shopId;
}

export async function getOrCreateShop(
  clerkUserId: string,
  email: string,
  name: string,
): Promise<{ shopId: string | null; role: string; profile: string }> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT shop_id, role, profile FROM shop_users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
  `;
  if (rows.length > 0) {
    const r = rows[0] as any;
    const shopId = (r.shop_id as string) ?? null;
    // If the user exists but has no shop_id, link them to the default shop
    if (!shopId) {
      const defaultShopId = await ensureDefaultShop();
      await sql`UPDATE shop_users SET shop_id = ${defaultShopId} WHERE clerk_user_id = ${clerkUserId}`;
      return { shopId: defaultShopId, role: (r.role as string) ?? 'owner', profile: (r.profile as string) ?? 'owner' };
    }
    return {
      shopId,
      role: (r.role as string) ?? 'owner',
      profile: (r.profile as string) ?? 'owner',
    };
  }
  // New Clerk user — link them to the default shop so they share data
  // with data-entry users on the same shop
  const defaultShopId = await ensureDefaultShop();
  await sql`
    INSERT INTO shop_users (clerk_user_id, shop_id, role, profile, name, email)
    VALUES (${clerkUserId}, ${defaultShopId}, 'owner', 'owner', ${name || null}, ${email || null})
  `;
  return { shopId: defaultShopId, role: 'owner', profile: 'owner' };
}

export async function createShop(
  clerkUserId: string,
  email: string,
  name: string,
  shopName: string,
  shopAddress: string,
  shopPhone: string,
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const [shop] = await sql`
    INSERT INTO shops (name, address, phone, trial_ends)
    VALUES (${shopName}, ${shopAddress || null}, ${shopPhone || null}, now() + interval '30 days')
    RETURNING id
  `;
  if (!shop) throw new Error('Could not create shop');
  const shopId = (shop as any).id as string;
  await sql`
    INSERT INTO shop_users (clerk_user_id, shop_id, role, profile, name, email)
    VALUES (${clerkUserId}, ${shopId}, 'owner', 'owner', ${name || null}, ${email || null})
  `;
  return shopId;
}

// ── Data-entry account management (backend-only, no Clerk) ──

// Hash a password with a random salt
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

// Verify a password against a stored hash
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const testHash = createHash('sha256').update(salt + password).digest('hex');
  // Simple string comparison — timingSafeEqual throws on different-length buffers
  return hash === testHash;
}

// Set the data-entry password and shop number for a shop
export async function setDataEntryPassword(shopId: string, password: string, shopNumber?: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const hashed = hashPassword(password);
  if (shopNumber !== undefined) {
    await sql`UPDATE shops SET data_entry_password = ${hashed}, shop_number = ${shopNumber.trim()} WHERE id = ${shopId}`;
  } else {
    await sql`UPDATE shops SET data_entry_password = ${hashed} WHERE id = ${shopId}`;
  }
}

// Get the shop number for a shop
export async function getShopNumber(shopId: string): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT shop_number FROM shops WHERE id = ${shopId} LIMIT 1`;
  if (rows.length === 0) return null;
  return (rows[0] as any).shop_number || null;
}

// Check if data-entry password is set for a shop
export async function hasDataEntryPassword(shopId: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT data_entry_password FROM shops WHERE id = ${shopId} LIMIT 1`;
  if (rows.length === 0) return false;
  return !!(rows[0] as any).data_entry_password;
}

// Clear the data-entry password for a shop
export async function clearDataEntryPassword(shopId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE shops SET data_entry_password = NULL WHERE id = ${shopId}`;
}

// Verify data-entry login by shop number + password, return shopId
export async function verifyDataEntryPassword(shopNumber: string, password: string): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  // Find the shop by shop_number (case-insensitive, trimmed)
  const rows = await sql`
    SELECT id, data_entry_password FROM shops
    WHERE LOWER(TRIM(shop_number)) = LOWER(TRIM(${shopNumber}))
    AND data_entry_password IS NOT NULL
    AND active = true
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const shop = rows[0] as any;
  if (!verifyPassword(password, shop.data_entry_password)) return null;
  return shop.id as string;
}

// Verify data-entry password for a specific shopId (used by change-password)
export async function verifyDataEntryPasswordForShop(shopId: string, password: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT data_entry_password FROM shops WHERE id = ${shopId} LIMIT 1`;
  if (rows.length === 0) return false;
  const stored = (rows[0] as any).data_entry_password;
  if (!stored) return false;
  return verifyPassword(password, stored);
}

export async function getAllShops(): Promise<any[]> {
  await ensureSchema();
  const sql = getSql();
  // Join with shop_users for owner info and count customers/transactions per shop
  const rows = await sql`
    SELECT
      s.id, s.name, s.address, s.phone, s.active, s.billing_status,
      s.trial_ends, s.created_at,
      COALESCE(ou.owner_name, '') as owner_name,
      COALESCE(ou.owner_email, '') as owner_email,
      COALESCE(c.cnt, 0) as customer_count,
      COALESCE(t.cnt, 0) as txn_count
    FROM shops s
    LEFT JOIN LATERAL (
      SELECT name as owner_name, email as owner_email
      FROM shop_users WHERE shop_id = s.id AND role = 'owner' LIMIT 1
    ) ou ON true
    LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM customers WHERE shop_id = s.id) c ON true
    LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM transactions WHERE shop_id = s.id) t ON true
    ORDER BY s.created_at DESC
  `;
  return rows as any[];
}

export async function getShopById(shopId: string): Promise<any | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM shops WHERE id = ${shopId} LIMIT 1`;
  return (rows[0] as any) ?? null;
}

export async function setShopBillingStatus(shopId: string, status: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE shops SET billing_status = ${status} WHERE id = ${shopId}`;
}

export async function setShopActive(shopId: string, active: boolean): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE shops SET active = ${active} WHERE id = ${shopId}`;
}

// Set trial end date for a shop
export async function setShopTrialEnd(shopId: string, trialEnds: string | null): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE shops SET trial_ends = ${trialEnds}, billing_status = 'trial' WHERE id = ${shopId}`;
}

// Extend a shop's subscription by adding days to the latest coverage end date.
// If no existing subscription, creates one starting today.
export async function extendSubscription(shopId: string, days: number): Promise<{ newCoversTo: string }> {
  await ensureSchema();
  const sql = getSql();
  const [latest] = await sql`
    SELECT covers_to FROM subscription_payments
    WHERE shop_id = ${shopId}
    ORDER BY covers_to DESC LIMIT 1
  `;
  const today = istToday();
  const baseDate = latest ? new Date((latest as any).covers_to) : new Date(today);
  // If already expired, extend from today instead
  if (baseDate < new Date(today)) {
    baseDate.setTime(new Date(today).getTime());
  }
  baseDate.setDate(baseDate.getDate() + days);
  const newCoversTo = baseDate.toISOString().slice(0, 10);

  // Insert a $0 extension payment record (or we could update the existing one)
  // For audit trail, record as a $0 extension with notes
  await sql`
    INSERT INTO subscription_payments
      (shop_id, amount, payment_method, payment_date, plan, covers_from, covers_to, notes, recorded_by)
    VALUES
      (${shopId}, 0, 'extension', ${today}, 'extension', ${today}, ${newCoversTo}, ${'Extended by ' + days + ' days'}, 'admin')
  `;
  await sql`UPDATE shops SET billing_status = 'active' WHERE id = ${shopId}`;
  return { newCoversTo };
}

// Get monthly revenue data for chart (last 12 months)
export async function getMonthlyRevenue(): Promise<{ month: string; revenue: number; count: number }[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', payment_date), 'YYYY-MM') as month,
      COALESCE(SUM(amount), 0) as revenue,
      COUNT(*) as count
    FROM subscription_payments
    WHERE payment_date >= CURRENT_DATE - INTERVAL '12 months'
      AND amount > 0
    GROUP BY DATE_TRUNC('month', payment_date)
    ORDER BY month
  `;
  return (rows as any[]).map((r) => ({
    month: r.month,
    revenue: Number(r.revenue),
    count: Number(r.count),
  }));
}

/* ---- Subscriptions ---- */

// Default pricing plans (in INR). Can be overridden via app_settings (global, shop_id = NULL).
export const DEFAULT_PLANS = [
  { id: 'single', label: 'Single Shop', price: 15000, durationMonths: 12, maxShops: 1 },
  { id: 'multi', label: 'Multi-Shop (3)', price: 25000, durationMonths: 12, maxShops: 3 },
  { id: 'market', label: 'Market Master (10)', price: 50000, durationMonths: 12, maxShops: 10 },
] as const;

export interface Plan {
  id: string;
  label: string;
  price: number;
  durationMonths: number;
  maxShops: number;
}

// Get pricing config — stored as JSON in app_settings under key 'subscription_plans'.
// Falls back to DEFAULT_PLANS if not configured.
export async function getPlans(): Promise<Plan[]> {
  if (!isDbConfigured()) return [...DEFAULT_PLANS];
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql`
    SELECT value FROM app_settings WHERE key = 'subscription_plans' AND shop_id IS NULL LIMIT 1
  `;
  if (row) {
    try {
      const parsed = JSON.parse((row as any).value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return [...DEFAULT_PLANS];
}

// Save pricing config (admin only, stored globally)
export async function setPlans(plans: Plan[]): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO app_settings (key, value, updated_at, shop_id)
    VALUES ('subscription_plans', ${JSON.stringify(plans)}, now(), NULL)
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(plans)}, updated_at = now()
  `;
}

export interface SubscriptionPayment {
  id: string;
  shop_id: string;
  shop_name: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  plan: string;
  covers_from: string;
  covers_to: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

// Record a subscription payment for a shop
export async function recordSubscriptionPayment(
  shopId: string,
  amount: number,
  paymentMethod: string,
  paymentDate: string,
  plan: string,
  coversFrom: string,
  coversTo: string,
  notes?: string,
  recordedBy?: string
): Promise<{ id: string }> {
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO subscription_payments
      (shop_id, amount, payment_method, payment_date, plan, covers_from, covers_to, notes, recorded_by)
    VALUES
      (${shopId}, ${amount}, ${paymentMethod}, ${paymentDate}, ${plan}, ${coversFrom}, ${coversTo}, ${notes || null}, ${recordedBy || null})
    RETURNING id
  `;
  // Update shop billing_status to 'active'
  await sql`UPDATE shops SET billing_status = 'active' WHERE id = ${shopId}`;
  return { id: (row as any)?.id ?? '' };
}

// Get all subscription payments (admin view, all shops)
export async function getAllSubscriptionPayments(): Promise<SubscriptionPayment[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT sp.*, s.name as shop_name
    FROM subscription_payments sp
    JOIN shops s ON s.id = sp.shop_id
    ORDER BY sp.payment_date DESC, sp.created_at DESC
  `;
  return (rows as any[]).map((r) => ({
    id: r.id,
    shop_id: r.shop_id,
    shop_name: r.shop_name,
    amount: Number(r.amount),
    payment_method: r.payment_method,
    payment_date: r.payment_date ? r.payment_date.toISOString().slice(0, 10) : '',
    plan: r.plan,
    covers_from: r.covers_from ? r.covers_from.toISOString().slice(0, 10) : '',
    covers_to: r.covers_to ? r.covers_to.toISOString().slice(0, 10) : '',
    notes: r.notes,
    recorded_by: r.recorded_by,
    created_at: r.created_at ? r.created_at.toISOString() : '',
  }));
}

// Get subscription payments for a specific shop
export async function getShopSubscriptionPayments(shopId: string): Promise<SubscriptionPayment[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT sp.*, s.name as shop_name
    FROM subscription_payments sp
    JOIN shops s ON s.id = sp.shop_id
    WHERE sp.shop_id = ${shopId}
    ORDER BY sp.payment_date DESC, sp.created_at DESC
  `;
  return (rows as any[]).map((r) => ({
    id: r.id,
    shop_id: r.shop_id,
    shop_name: r.shop_name,
    amount: Number(r.amount),
    payment_method: r.payment_method,
    payment_date: r.payment_date ? r.payment_date.toISOString().slice(0, 10) : '',
    plan: r.plan,
    covers_from: r.covers_from ? r.covers_from.toISOString().slice(0, 10) : '',
    covers_to: r.covers_to ? r.covers_to.toISOString().slice(0, 10) : '',
    notes: r.notes,
    recorded_by: r.recorded_by,
    created_at: r.created_at ? r.created_at.toISOString() : '',
  }));
}

// Get subscription status for a shop: latest payment, coverage end date, days remaining
export async function getShopSubscriptionStatus(shopId: string): Promise<{
  status: 'active' | 'expired' | 'none';
  plan: string | null;
  coversTo: string | null;
  daysRemaining: number;
  totalPaid: number;
}> {
  await ensureSchema();
  const sql = getSql();
  const [latest] = await sql`
    SELECT * FROM subscription_payments
    WHERE shop_id = ${shopId}
    ORDER BY covers_to DESC LIMIT 1
  `;
  if (!latest) {
    return { status: 'none', plan: null, coversTo: null, daysRemaining: 0, totalPaid: 0 };
  }
  const coversTo = (latest as any).covers_to;
  const coversToStr = coversTo ? coversTo.toISOString().slice(0, 10) : '';
  const today = new Date();
  const coversToDate = new Date(coversToStr);
  const diffMs = coversToDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const [totals] = await sql`
    SELECT COALESCE(SUM(amount), 0) as total FROM subscription_payments WHERE shop_id = ${shopId}
  `;

  return {
    status: daysRemaining > 0 ? 'active' : 'expired',
    plan: (latest as any).plan,
    coversTo: coversToStr,
    daysRemaining,
    totalPaid: Number((totals as any)?.total ?? 0),
  };
}

// Get subscription summary for admin dashboard
export async function getSubscriptionSummary(): Promise<{
  totalRevenue: number;
  activeSubscriptions: number;
  expiringSoon: number;
  totalPayments: number;
  recentPayments: SubscriptionPayment[];
}> {
  await ensureSchema();
  const sql = getSql();

  const [agg] = await sql`
    SELECT
      COALESCE(SUM(amount), 0) as total_revenue,
      COUNT(DISTINCT shop_id) as total_paying_shops,
      COUNT(*) as total_payments
    FROM subscription_payments
  `;

  // Active subscriptions: shops where the latest covers_to is in the future
  const activeRows = await sql`
    SELECT DISTINCT shop_id FROM subscription_payments
    WHERE covers_to >= CURRENT_DATE
  `;
  const activeCount = activeRows.length;

  // Expiring within 30 days
  const expiringRows = await sql`
    SELECT shop_id, MAX(covers_to) as latest_covers
    FROM subscription_payments
    GROUP BY shop_id
    HAVING MAX(covers_to) >= CURRENT_DATE AND MAX(covers_to) <= CURRENT_DATE + INTERVAL '30 days'
  `;
  const expiringSoon = expiringRows.length;

  // Recent 10 payments
  const recentRows = await sql`
    SELECT sp.*, s.name as shop_name
    FROM subscription_payments sp
    JOIN shops s ON s.id = sp.shop_id
    ORDER BY sp.created_at DESC LIMIT 10
  `;
  const recentPayments = (recentRows as any[]).map((r) => ({
    id: r.id,
    shop_id: r.shop_id,
    shop_name: r.shop_name,
    amount: Number(r.amount),
    payment_method: r.payment_method,
    payment_date: r.payment_date ? r.payment_date.toISOString().slice(0, 10) : '',
    plan: r.plan,
    covers_from: r.covers_from ? r.covers_from.toISOString().slice(0, 10) : '',
    covers_to: r.covers_to ? r.covers_to.toISOString().slice(0, 10) : '',
    notes: r.notes,
    recorded_by: r.recorded_by,
    created_at: r.created_at ? r.created_at.toISOString() : '',
  }));

  return {
    totalRevenue: Number((agg as any)?.total_revenue ?? 0),
    activeSubscriptions: activeCount,
    expiringSoon,
    totalPayments: Number((agg as any)?.total_payments ?? 0),
    recentPayments,
  };
}

/* ---- Customers ---- */

export async function getCustomerNames(shopId: string): Promise<string[]> {
  if (!isDbConfigured()) {
    return (seed as unknown as Customer[]).map((c) => c.name);
  }
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT name FROM customers WHERE shop_id = ${shopId} ORDER BY name`;
  return rows.map((r) => r.name as string);
}

export async function getCustomerList(shopId: string): Promise<{ id: string; name: string; englishName: string | null; teluguName: string | null; hindiName: string | null; phone: string | null }[]> {
  if (!isDbConfigured()) {
    return (seed as unknown as Customer[]).map((c) => ({ id: c.id || `seed-${c.name}`, name: c.name, englishName: c.englishName || null, teluguName: c.teluguName || null, hindiName: c.hindiName || null, phone: c.phone || null }));
  }
  await ensureSchema();
  const sql = getSql();
  // Ensure CASH SALES customer exists for this shop
  const [cash] = await sql`SELECT id FROM customers WHERE name = 'CASH SALES' AND shop_id = ${shopId}`;
  if (!cash) {
    await sql`INSERT INTO customers (name, english_name, telugu_name, hindi_name, shop_id) VALUES ('CASH SALES', 'CASH SALES', 'నగదు అమ్మకాలు', 'नकद बिक्री', ${shopId})`;
  }
  const rows = await sql`SELECT id, name, english_name, telugu_name, hindi_name, phone FROM customers WHERE shop_id = ${shopId} ORDER BY name`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, englishName: r.english_name as string | null, teluguName: r.telugu_name as string | null, hindiName: r.hindi_name as string | null, phone: r.phone as string | null }));
}

export async function addCustomer(
  shopId: string,
  data: { 
    name: string; 
    englishName?: string | null; 
    teluguName?: string | null;
    hindiName?: string | null;
    phone?: string | null; 
    creditLimit?: number | null 
  }
): Promise<{ id: string; name: string }> {
  await ensureSchema();
  const sql = getSql();
  
  // Check if customer already exists
  const [existing] = await sql`SELECT id FROM customers WHERE name = ${data.name} AND shop_id = ${shopId}`;
  if (existing) {
    // Update phone, english name, telugu name, hindi name and credit limit if provided
    if (data.phone !== undefined) {
      await sql`UPDATE customers SET phone = ${data.phone || null} WHERE id = ${(existing as any).id} AND shop_id = ${shopId}`;
    }
    if (data.englishName !== undefined) {
      await sql`UPDATE customers SET english_name = ${data.englishName || null} WHERE id = ${(existing as any).id} AND shop_id = ${shopId}`;
    }
    if (data.teluguName !== undefined) {
      await sql`UPDATE customers SET telugu_name = ${data.teluguName || null} WHERE id = ${(existing as any).id} AND shop_id = ${shopId}`;
    }
    if (data.hindiName !== undefined) {
      await sql`UPDATE customers SET hindi_name = ${data.hindiName || null} WHERE id = ${(existing as any).id} AND shop_id = ${shopId}`;
    }
    if (data.creditLimit !== undefined) {
      await sql`UPDATE customers SET credit_limit = ${data.creditLimit} WHERE id = ${(existing as any).id} AND shop_id = ${shopId}`;
    }
    return { id: (existing as any).id, name: data.name };
  }
  
  // Insert new customer
  const [row] = await sql`
    INSERT INTO customers (name, english_name, telugu_name, hindi_name, phone, credit_limit, shop_id) 
    VALUES (${data.name}, ${data.englishName || null}, ${data.teluguName || null}, ${data.hindiName || null}, ${data.phone || null}, ${data.creditLimit ?? null}, ${shopId}) 
    RETURNING id, name
  `;
  return { id: (row as any).id, name: (row as any).name };
}

export async function getCustomers(shopId: string, fyStartYear?: number): Promise<Customer[]> {
  if (!isDbConfigured()) {
    return (seed as unknown as Customer[]).map((c) => ({
      ...c,
      id: c.id || `seed-${c.name}`,
      txns: (c.txns || []).map((txn) => ({
        ...txn,
        items: normalizeSeedItems((txn as { items?: unknown }).items),
      })),
    }));
  }

  await ensureSchema();
  const sql = getSql();

  // NOTE: autoCloseFY is called by the dashboard route before getCustomers,
  // so we don't call it here to avoid duplicate queries.

  // Run the 3 main queries in parallel (independent of each other)
  const [customers, txns, items] = await Promise.all([
    sql`SELECT id, name, english_name, telugu_name, hindi_name, phone, credit_limit FROM customers WHERE shop_id = ${shopId} ORDER BY name`,
    sql`SELECT * FROM transactions WHERE shop_id = ${shopId} ORDER BY date, created_at`,
    sql`SELECT * FROM bill_items WHERE shop_id = ${shopId}`,
  ]);

  const itemsByTxn = new Map<string, BillItem[]>();
  for (const it of items) {
    const arr = itemsByTxn.get(it.transaction_id as string) || [];
    arr.push(it as unknown as BillItem);
    itemsByTxn.set(it.transaction_id as string, arr);
  }

  function toDateStr(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const d = value as Date;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // FY date range for filtering
  const fyRange = fyStartYear !== undefined ? fyDateRange(fyStartYear) : null;

  // Batch-fetch opening balances for all customers (avoids N+1 queries)
  const nonCashCustomerIds = (customers as any[])
    .filter((c) => (c.name as string) !== 'CASH SALES')
    .map((c) => c.id as string);
  const openingBalances = fyStartYear !== undefined
    ? await getFYOpeningBalancesBatch(sql, shopId, nonCashCustomerIds, fyStartYear)
    : new Map<string, number>();

  const customersOut: Customer[] = [];
  for (const c of customers) {
    const isCashSales = (c.name as string) === 'CASH SALES';

    // Filter transactions by FY range if specified
    let customerTxns = (txns as any[]).filter((t) => t.customer_id === c.id);
    if (fyRange) {
      customerTxns = customerTxns.filter((t) => {
        const txDate = toDateStr(t.date);
        return txDate >= fyRange.from && txDate <= fyRange.to;
      });
    }

    // Opening balance: from batch-fetched map (0 if no FY filter or CASH SALES)
    const openingBalance = (fyStartYear !== undefined && !isCashSales)
      ? (openingBalances.get(c.id as string) ?? 0)
      : 0;

    let balance = openingBalance;
    const txnViews: TxnView[] = customerTxns.map((t) => {
      const billAmount = Number(t.bill_amount);
      const paidAmount = Number(t.amount_paid);
      // Cash sale: bill_amount > 0 AND amount_paid >= bill_amount (immediately settled)
      // Payment: bill_amount = 0 AND amount_paid > 0
      // Credit bill: bill_amount > 0 AND amount_paid < bill_amount
      const isCashSale = billAmount > 0 && paidAmount >= billAmount;
      const isPayment = billAmount === 0 && paidAmount > 0;
      const type: 'bill' | 'payment' = isPayment ? 'payment' : 'bill';
      const amount = isPayment ? paidAmount : billAmount;
      const title = isCashSale
        ? 'Cash Sale'
        : isPayment
          ? 'Payment received'
          : t.bill_no
            ? `Bill No. ${t.bill_no}`
            : 'Bill';
      // Cash sales don't affect the running balance (settled immediately)
      if (type === 'bill' && !isCashSale) balance += billAmount;
      else if (isPayment) balance -= paidAmount;

      const txnItems = (itemsByTxn.get(t.id as string) || []).map((it) => {
        let detail = it.display || '';
        if (!detail) {
          const qty = it.qty || '';
          const rate = it.rate || '';
          if (qty && rate) detail = `${qty} × ${rate} = ${it.amount}`;
          else if (qty) detail = `${qty} = ${it.amount}`;
          else detail = String(it.amount);
        }
        const inferred = inferItemKind(it);
        const parsed = parseDisplay(detail);
        const amount = Number(it.amount) || parsed.amount || 0;
        return {
          name: it.confirmed_name,
          qty: it.qty || parsed.qty,
          rate: it.rate || parsed.rate,
          amount,
          display: detail,
          kind: inferred.kind,
          chargeCode: inferred.chargeCode,
          bags: it.bags ? String(it.bags) : null,
        };
      });

      return {
        id: t.id,
        title,
        type,
        amount,
        balanceAfter: balance,
        date: toDateStr(t.date),
        createdAt: t.created_at ? new Date(t.created_at as string).toISOString() : null,
        billNo: t.bill_no,
        items: txnItems,
        market: decodeMarketNotes(t.notes),
      };
    });

    // FY-scoped totals (or all-time if no FY filter)
    const billed = customerTxns.reduce((s: number, t: any) => s + Number(t.bill_amount), 0);
    const paid = customerTxns.reduce((s: number, t: any) => s + Number(t.amount_paid), 0);
    // due = opening + FY bills - FY payments (or all-time if no FY filter)
    const due = fyStartYear !== undefined ? openingBalance + billed - paid : billed - paid;

    customersOut.push({
      id: c.id as string,
      name: c.name as string,
      englishName: (c.english_name as string | null) ?? null,
      teluguName: (c.telugu_name as string | null) ?? null,
      hindiName: (c.hindi_name as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      creditLimit: c.credit_limit !== null && c.credit_limit !== undefined ? Number(c.credit_limit) : null,
      billed,
      paid,
      due: isCashSales ? 0 : due,  // CASH SALES always shows 0 due
      txns: txnViews,
    });
  }

  return customersOut;
}

export async function saveBill(shopId: string, bill: BillData): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  // Find or create customer scoped to this shop
  // Prefer customerId when provided (ID-based selection); fall back to name for backward compat
  let customer: any;
  if (bill.customerId) {
    [customer] = await sql`SELECT id FROM customers WHERE id = ${bill.customerId} AND shop_id = ${shopId} LIMIT 1`;
  }
  if (!customer) {
    [customer] = await sql`SELECT id FROM customers WHERE name = ${bill.customerName} AND shop_id = ${shopId} LIMIT 1`;
  }
  if (!customer) {
    [customer] = await sql`
      INSERT INTO customers (name, shop_id) VALUES (${bill.customerName}, ${shopId}) RETURNING id
    `;
  }

  if (!customer) throw new Error('Could not upsert customer');

  const notes = bill.market ? encodeMarketNotes(bill.market) : null;

  // Cash sales: settle immediately (amount_paid = total, so due = 0)
  // Credit sales: amount_paid = 0 (customer owes the amount)
  const isCash = bill.paymentType === 'cash';
  const amountPaid = isCash ? bill.total : 0;

  const [transaction] = await sql`
    INSERT INTO transactions (customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path, shop_id, payment_method)
    VALUES (${customer.id}, ${bill.date}, ${bill.billNo}, ${bill.total}, ${amountPaid}, ${notes}, ${bill.imagePath || null}, ${shopId}, ${isCash ? 'cash' : 'credit'})
    RETURNING id
  `;

  if (!transaction) throw new Error('Could not insert transaction');

  for (const it of bill.items) {
    const inferred = inferItemKind(it);
    await sql`
      INSERT INTO bill_items (transaction_id, raw_text, confirmed_name, qty, rate, amount, display, kind, charge_code, shop_id, farmer, hamali, bags)
      VALUES (${transaction.id}, ${it.raw_text}, ${it.confirmed_name}, ${numericQty(it.qty)}, ${it.rate}, ${it.amount}, ${it.display}, ${inferred.kind}, ${inferred.chargeCode}, ${shopId}, ${it.farmer || null}, ${it.hamali || null}, ${it.bags || null})
    `;
  }

  // If this bill is backdated to a previous FY that's already closed, recalc opening balances
  const billFY = currentFYStartYear(new Date(bill.date + 'T00:00:00'));
  const currentFY = currentFYStartYear();
  if (billFY < currentFY) {
    const [closed] = await sql`SELECT 1 FROM fy_opening_balances WHERE shop_id = ${shopId} AND fy_start_year > ${billFY} LIMIT 1`;
    if (closed) {
      await recalcFYBalances(shopId, billFY);
    }
  }
}

export async function recordPayment(shopId: string, customerName: string, date: string, amount: number, notes: string, paymentMethod: string = 'credit', customerId?: string | null): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  // Prefer customerId when provided; fall back to name for backward compat
  let customer: any;
  if (customerId) {
    [customer] = await sql`SELECT id FROM customers WHERE id = ${customerId} AND shop_id = ${shopId} LIMIT 1`;
  }
  if (!customer) {
    [customer] = await sql`SELECT id FROM customers WHERE name = ${customerName} AND shop_id = ${shopId} LIMIT 1`;
  }
  if (!customer) {
    [customer] = await sql`
      INSERT INTO customers (name, shop_id) VALUES (${customerName}, ${shopId}) RETURNING id
    `;
  }

  if (!customer) throw new Error('Could not upsert customer');

  await sql`
    INSERT INTO transactions (customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path, shop_id, payment_method)
    VALUES (${customer.id}, ${date}, NULL, 0, ${amount}, ${notes || 'Payment received'}, NULL, ${shopId}, ${paymentMethod})
  `;

  // If this payment is backdated to a previous FY that's already closed, recalc opening balances
  const paymentFY = currentFYStartYear(new Date(date + 'T00:00:00'));
  const currentFY = currentFYStartYear();
  if (paymentFY < currentFY) {
    const [closed] = await sql`SELECT 1 FROM fy_opening_balances WHERE shop_id = ${shopId} AND fy_start_year > ${paymentFY} LIMIT 1`;
    if (closed) {
      await recalcFYBalances(shopId, paymentFY);
    }
  }
}

export async function getDaySales(shopId: string, date: string): Promise<any[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      t.id as txn_id,
      t.bill_amount,
      t.amount_paid,
      t.customer_id,
      c.name as customer_name,
      c.english_name,
      c.telugu_name,
      c.hindi_name,
      bi.confirmed_name as item,
      bi.qty,
      bi.rate,
      bi.amount,
      bi.bags,
      bi.hamali,
      bi.farmer
    FROM transactions t
    JOIN customers c ON c.id = t.customer_id
    LEFT JOIN bill_items bi ON bi.transaction_id = t.id
    WHERE t.date = ${date}
      AND t.shop_id = ${shopId}
      AND t.bill_amount > 0
      AND (bi.kind = 'item' OR bi.kind IS NULL)
    ORDER BY t.created_at, bi.created_at
  `;
  return rows.map((r: any) => ({
    id: r.txn_id + '-' + (r.item || ''),
    txnId: r.txn_id,
    item: r.item || '',
    farmer: r.farmer || '',
    customerId: r.customer_id,
    customerName: r.customer_name || '',
    englishName: r.english_name || null,
    teluguName: r.telugu_name || null,
    hindiName: r.hindi_name || null,
    bags: r.bags,
    kgs: r.qty,
    rate: r.rate,
    amount: Number(r.amount || r.bill_amount || 0),
    hamali: r.hamali,
    isCash: Number(r.amount_paid) > 0 && Number(r.amount_paid) >= Number(r.bill_amount),
  }));
}

/* ---- Purchases ---- */

export async function getPurchases(shopId: string): Promise<PurchaseView[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`SELECT * FROM purchases WHERE shop_id = ${shopId} ORDER BY date DESC, created_at DESC`;
  const items = await sql`SELECT * FROM purchase_items WHERE shop_id = ${shopId}`;

  const byPurchase = new Map<string, any[]>();
  for (const it of items) {
    const arr = byPurchase.get(it.purchase_id as string) || [];
    arr.push(it);
    byPurchase.set(it.purchase_id as string, arr);
  }

  return (rows as any[]).map((p) => ({
    id: p.id as string,
    date: toDateOnly(p.date),
    supplier: (p.supplier as string) || '',
    billNo: (p.bill_no as string) || null,
    total: Number(p.total),
    market: decodeMarketNotes(p.notes),
    items: (byPurchase.get(p.id as string) || []).map((it) => ({
      name: it.name as string,
      qty: (it.qty as string) || null,
      rate: (it.rate as string) || null,
      amount: Number(it.amount),
      kind: (it.kind as ChargeKind) || 'item',
      chargeCode: (it.charge_code as any) || null,
    })),
  }));
}

export async function savePurchase(shopId: string, purchase: PurchaseData): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  let supplierId: string | null = null;
  if (purchase.supplier?.trim()) {
    let [sup] = await sql`SELECT id FROM suppliers WHERE name = ${purchase.supplier.trim()} AND shop_id = ${shopId} LIMIT 1`;
    if (!sup) {
      [sup] = await sql`
        INSERT INTO suppliers (name, shop_id) VALUES (${purchase.supplier.trim()}, ${shopId}) RETURNING id
      `;
    }
    supplierId = (sup as any)?.id as string;
  }

  const notes = purchase.market ? encodeMarketNotes(purchase.market) : null;
  const [row] = await sql`
    INSERT INTO purchases (date, supplier, bill_no, total, notes, supplier_id, shop_id)
    VALUES (${purchase.date}, ${purchase.supplier || null}, ${purchase.billNo || null}, ${purchase.total}, ${notes}, ${supplierId}, ${shopId})
    RETURNING id
  `;
  if (!row) throw new Error('Could not insert purchase');

  for (const it of purchase.items) {
    const hit = it.kind ? null : detectCharge(it.name || '');
    const kind = it.kind || (hit ? 'charge' : 'item');
    const code = it.chargeCode ?? (hit ? hit.code : null);
    await sql`
      INSERT INTO purchase_items (purchase_id, name, qty, rate, amount, kind, charge_code, shop_id)
      VALUES (${row.id}, ${it.name}, ${it.qty}, ${it.rate}, ${it.amount}, ${kind}, ${code}, ${shopId})
    `;
  }
}

/**
 * Save a full patti (N customer bills + optional farmer purchase) in one Postgres transaction.
 * If any write fails, nothing is committed.
 */
export async function saveEntryBatch(
  shopId: string,
  bills: BillData[],
  purchase: PurchaseData | null,
): Promise<{ sales: { txnId: string; customerId: string }[]; purchaseId: string | null }> {
  if (!bills.length) throw new Error('No sales to save');
  await ensureSchema();
  const sql = getSql();

  const resolved = new Map<string, string>();
  const newCustomers: { id: string; name: string }[] = [];

  for (const bill of bills) {
    const name = (bill.customerName || '').trim();
    if (!name && !bill.customerId) throw new Error('Each sale needs a customer');
    const mapKey = (bill.customerId || name).toLowerCase();
    if (resolved.has(mapKey) || (name && resolved.has(name.toLowerCase()))) continue;

    let row: { id: string } | undefined;
    if (bill.customerId) {
      const found = await sql`SELECT id FROM customers WHERE id = ${bill.customerId} AND shop_id = ${shopId} LIMIT 1`;
      row = found[0] as { id: string } | undefined;
    }
    if (!row && name) {
      const found = await sql`SELECT id FROM customers WHERE name = ${name} AND shop_id = ${shopId} LIMIT 1`;
      row = found[0] as { id: string } | undefined;
    }
    if (row) {
      resolved.set(mapKey, row.id);
      if (name) resolved.set(name.toLowerCase(), row.id);
    } else {
      const id = randomUUID();
      newCustomers.push({ id, name: name || 'Customer' });
      resolved.set(mapKey, id);
      if (name) resolved.set(name.toLowerCase(), id);
    }
  }

  let supplierId: string | null = null;
  let newSupplier: { id: string; name: string; phone: string | null } | null = null;
  if (purchase?.supplier?.trim()) {
    const sname = purchase.supplier.trim();
    const sphone = (purchase.supplierPhone || '').trim() || null;
    const found = await sql`SELECT id, phone FROM suppliers WHERE name = ${sname} AND shop_id = ${shopId} LIMIT 1`;
    const sup = found[0] as { id: string; phone: string | null } | undefined;
    if (sup) {
      supplierId = sup.id;
      // Update phone if a new one was provided and differs from stored
      if (sphone && sup.phone !== sphone) {
        await sql`UPDATE suppliers SET phone = ${sphone} WHERE id = ${sup.id}`;
      }
    } else {
      newSupplier = { id: randomUUID(), name: sname, phone: sphone };
      supplierId = newSupplier.id;
    }
  }

  const sales: { txnId: string; customerId: string }[] = [];
  let purchaseId: string | null = null;

  await sql.transaction((txn) => {
    const q: ReturnType<typeof txn>[] = [];
    for (const c of newCustomers) {
      q.push(txn`INSERT INTO customers (id, name, shop_id) VALUES (${c.id}, ${c.name}, ${shopId})`);
    }
    if (newSupplier) {
      q.push(txn`INSERT INTO suppliers (id, name, phone, shop_id) VALUES (${newSupplier.id}, ${newSupplier.name}, ${newSupplier.phone}, ${shopId})`);
    }
    for (const bill of bills) {
      const name = (bill.customerName || '').trim();
      const customerId = resolved.get((bill.customerId || name).toLowerCase()) || resolved.get(name.toLowerCase());
      if (!customerId) throw new Error(`Could not resolve customer ${name}`);
      const txnId = randomUUID();
      sales.push({ txnId, customerId });
      const isCash = bill.paymentType === 'cash';
      const amountPaid = isCash ? bill.total : 0;
      const notes = bill.market ? encodeMarketNotes(bill.market) : null;
      q.push(txn`
        INSERT INTO transactions (id, customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path, shop_id, payment_method)
        VALUES (${txnId}, ${customerId}, ${bill.date}, ${bill.billNo}, ${bill.total}, ${amountPaid}, ${notes}, ${bill.imagePath || null}, ${shopId}, ${isCash ? 'cash' : 'credit'})
      `);
      for (const it of bill.items) {
        const inferred = inferItemKind(it);
        q.push(txn`
          INSERT INTO bill_items (transaction_id, raw_text, confirmed_name, qty, rate, amount, display, kind, charge_code, shop_id, farmer, hamali, bags)
          VALUES (${txnId}, ${it.raw_text}, ${it.confirmed_name}, ${numericQty(it.qty)}, ${it.rate}, ${it.amount}, ${it.display}, ${inferred.kind}, ${inferred.chargeCode}, ${shopId}, ${it.farmer || null}, ${it.hamali || null}, ${it.bags || null})
        `);
      }
    }
    if (purchase && purchase.items.length > 0) {
      purchaseId = randomUUID();
      const notes = purchase.market ? encodeMarketNotes(purchase.market) : null;
      q.push(txn`
        INSERT INTO purchases (id, date, supplier, bill_no, total, notes, supplier_id, shop_id)
        VALUES (${purchaseId!}, ${purchase.date}, ${purchase.supplier || null}, ${purchase.billNo || null}, ${purchase.total}, ${notes}, ${supplierId}, ${shopId})
      `);
      for (const it of purchase.items) {
        const hit = it.kind ? null : detectCharge(it.name || '');
        const kind = it.kind || (hit ? 'charge' : 'item');
        const code = it.chargeCode ?? (hit ? hit.code : null);
        q.push(txn`
          INSERT INTO purchase_items (purchase_id, name, qty, rate, amount, kind, charge_code, shop_id)
          VALUES (${purchaseId}, ${it.name}, ${it.qty}, ${it.rate}, ${it.amount}, ${kind}, ${code}, ${shopId})
        `);
      }
    }
    return q;
  });

  const billFY = currentFYStartYear(new Date(bills[0].date + 'T00:00:00'));
  const currentFY = currentFYStartYear();
  if (billFY < currentFY) {
    const [closed] = await sql`SELECT 1 FROM fy_opening_balances WHERE shop_id = ${shopId} AND fy_start_year > ${billFY} LIMIT 1`;
    if (closed) {
      await recalcFYBalances(shopId, billFY);
    }
  }
  return { sales, purchaseId };
}

export async function deletePurchase(shopId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM purchase_items WHERE purchase_id = ${id} AND shop_id = ${shopId}`;
  await sql`DELETE FROM purchases WHERE id = ${id} AND shop_id = ${shopId}`;
}

export async function setCustomerPhone(shopId: string, id: string, phone: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE customers SET phone = ${phone || null} WHERE id = ${id} AND shop_id = ${shopId}`;
}

export async function deleteTransaction(shopId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM bill_items WHERE transaction_id = ${id} AND shop_id = ${shopId}`;
  await sql`DELETE FROM transactions WHERE id = ${id} AND shop_id = ${shopId}`;
}

// Fetch saved sales for a given date — used by the entry page to restore
// the "Sales today" section after a page refresh.
export async function getSalesForDate(shopId: string, date: string): Promise<{
  txnId: string;
  customerId: string;
  farmer: string;
  commodity: string;
  customerName: string;
  bags: string;
  weightKg: string;
  rate: string;
  amount: number;
  cash: boolean;
  hamali: string;
  createdAt: string | null;
}[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      t.id as txn_id,
      t.customer_id,
      t.bill_amount,
      t.payment_method,
      t.created_at,
      c.name as customer_name,
      bi.farmer,
      bi.confirmed_name,
      bi.qty,
      bi.rate,
      bi.amount,
      bi.bags,
      bi.hamali
    FROM transactions t
    JOIN bill_items bi ON bi.transaction_id = t.id
    LEFT JOIN customers c ON c.id = t.customer_id
    WHERE t.date = ${date}
      AND t.shop_id = ${shopId}
      AND (bi.kind = 'item' OR bi.kind IS NULL)
      AND t.bill_amount > 0
    ORDER BY t.created_at, bi.id
  `;
  return (rows as any[]).map((r) => ({
    txnId: r.txn_id,
    customerId: r.customer_id || '',
    farmer: r.farmer || '',
    commodity: r.confirmed_name || '',
    customerName: r.customer_name || '',
    bags: r.bags != null ? String(r.bags) : '',
    weightKg: r.qty || '',
    rate: r.rate || '',
    amount: Number(r.amount),
    cash: r.payment_method === 'cash',
    hamali: r.hamali != null ? String(r.hamali) : '',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));
}

/* ---- Suppliers ---- */

export async function createSupplier(shopId: string, name: string, phone?: string): Promise<Supplier> {
  await ensureSchema();
  const sql = getSql();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Supplier name is required');
  // Check if already exists
  const [existing] = await sql`SELECT id, name, phone FROM suppliers WHERE name = ${trimmedName} AND shop_id = ${shopId} LIMIT 1`;
  if (existing) return existing as Supplier;
  const [row] = await sql`
    INSERT INTO suppliers (name, phone, shop_id) VALUES (${trimmedName}, ${phone || null}, ${shopId})
    RETURNING id, name, phone
  `;
  return row as Supplier;
}

export async function getSuppliers(shopId: string): Promise<Supplier[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  const suppliers = await sql`SELECT id, name, phone, commission_pct FROM suppliers WHERE shop_id = ${shopId} ORDER BY name`;
  const purchases = await sql`SELECT id, supplier_id, date, bill_no, total FROM purchases WHERE supplier_id IS NOT NULL AND shop_id = ${shopId} ORDER BY date, created_at`;
  const payments = await sql`SELECT * FROM supplier_payments WHERE shop_id = ${shopId} ORDER BY date, created_at`;
  const items = await sql`SELECT * FROM purchase_items WHERE shop_id = ${shopId}`;

  const itemsByPurchase = new Map<string, any[]>();
  for (const it of items) {
    const arr = itemsByPurchase.get(it.purchase_id as string) || [];
    arr.push(it);
    itemsByPurchase.set(it.purchase_id as string, arr);
  }

  const out: Supplier[] = [];
  for (const s of suppliers) {
    const sid = s.id as string;
    const sPurchases = (purchases as any[]).filter((p) => p.supplier_id === sid);
    const sPayments = (payments as any[]).filter((p) => p.supplier_id === sid);

    const entries: Supplier['entries'] = [];
    for (const p of sPurchases) {
      entries.push({
        id: p.id as string,
        type: 'purchase' as const,
        date: toDateOnly(p.date),
        amount: Number(p.total),
        balanceAfter: 0,
        billNo: (p.bill_no as string) || null,
        items: (itemsByPurchase.get(p.id as string) || []).map((it) => ({
          name: it.name as string,
          qty: (it.qty as string) || null,
          rate: (it.rate as string) || null,
          amount: Number(it.amount),
          display: [it.qty, it.rate].filter(Boolean).join(' × ') || String(it.amount),
          kind: (it.kind as any) || 'item',
          chargeCode: (it.charge_code as any) || null,
        })),
      });
    }
    for (const pm of sPayments) {
      entries.push({
        id: pm.id as string,
        type: 'payment' as const,
        date: toDateOnly(pm.date),
        amount: Number(pm.amount),
        balanceAfter: 0,
        notes: (pm.notes as string) || null,
      });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    for (const e of entries) {
      balance += e.type === 'purchase' ? e.amount : -e.amount;
      e.balanceAfter = balance;
    }
    entries.reverse();

    const purchased = sPurchases.reduce((s: number, p: any) => s + Number(p.total), 0);
    const paid = sPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);

    out.push({
      id: sid,
      name: s.name as string,
      phone: (s.phone as string | null) ?? null,
      commissionPct: s.commission_pct != null ? String(s.commission_pct) : null,
      purchased,
      paid,
      balance: purchased - paid,
      entries,
    });
  }

  return out;
}

export async function recordSupplierPayment(shopId: string, supplierName: string, date: string, amount: number, notes: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  let [sup] = await sql`SELECT id FROM suppliers WHERE name = ${supplierName.trim()} AND shop_id = ${shopId} LIMIT 1`;
  if (!sup) {
    [sup] = await sql`
      INSERT INTO suppliers (name, shop_id) VALUES (${supplierName.trim()}, ${shopId}) RETURNING id
    `;
  }
  if (!sup) throw new Error('Could not upsert supplier');

  await sql`
    INSERT INTO supplier_payments (supplier_id, date, amount, notes, shop_id)
    VALUES (${sup.id}, ${date}, ${amount}, ${notes || null}, ${shopId})
  `;
}

export async function setSupplierPhone(shopId: string, id: string, phone: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE suppliers SET phone = ${phone || null} WHERE id = ${id} AND shop_id = ${shopId}`;
}

export async function setSupplierCommission(shopId: string, id: string, commissionPct: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const val = commissionPct.trim() === '' ? null : Number(commissionPct);
  await sql`UPDATE suppliers SET commission_pct = ${val} WHERE id = ${id} AND shop_id = ${shopId}`;
}

/* ---- Wastage ---- */

export async function getWastage(shopId: string): Promise<WastageEntry[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM wastage WHERE shop_id = ${shopId} ORDER BY date DESC, created_at DESC`;
  return (rows as any[]).map((r) => ({
    id: r.id as string,
    date: toDateOnly(r.date),
    itemName: r.item_name as string,
    qty: (r.qty as string) || null,
    unit: (r.unit as string) || null,
    reason: (r.reason as string) || '',
    estCost: Number(r.est_cost) || 0,
  }));
}

export async function saveWastage(shopId: string, entry: Omit<WastageEntry, 'id'>): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO wastage (date, item_name, qty, unit, reason, est_cost, shop_id)
    VALUES (${entry.date}, ${entry.itemName}, ${entry.qty || null}, ${entry.unit || null}, ${entry.reason || null}, ${entry.estCost}, ${shopId})
  `;
}

export async function deleteWastage(shopId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM wastage WHERE id = ${id} AND shop_id = ${shopId}`;
}

/* ---- Item catalog ---- */

// Default vegetable catalog — seeded into the database for every shop.
// Each entry: English name, Telugu name, Hindi name, and known aliases.
const DEFAULT_VEGETABLES: { name: string; telugu: string; hindi: string; aliases: string[] }[] = [
  // ── Common vegetables ──
  { name: 'Tomato', telugu: 'టమాటో', hindi: 'टमाटर', aliases: ['tomata', 'tamata', 'tamatar', 'tamaatar'] },
  { name: 'Onion', telugu: 'ఉల్లిపాయ', hindi: 'प्याज़', aliases: ['ulli', 'ullipaya', 'pyaz', 'pyaaj', 'pyaaz'] },
  { name: 'Potato', telugu: 'ఆలుగడ్డ', hindi: 'आलू', aliases: ['aloo', 'aaloo', 'aalu', 'alugadda', 'bangaladumpa'] },
  { name: 'Okra', telugu: 'బెండకాయ', hindi: 'भिंडी', aliases: ['bendi', 'bendakaya', 'bhindi', 'bhendi', 'ladies finger', 'lady finger'] },
  { name: 'Chili', telugu: 'మిర్చి', hindi: 'मिर्च', aliases: ['mirchi', 'mirapakaya', 'mirch'] },
  { name: 'Green chili', telugu: 'పచ్చ మిర్చి', hindi: 'हरी मिर्च', aliases: ['harimirch', 'green chilli', 'green chili'] },
  { name: 'Red chili', telugu: 'ఎర్ర మిర్చి', hindi: 'लाल मिर्च', aliases: ['lalmirch', 'red chilli', 'red chili'] },
  { name: 'Dry chili', telugu: 'ఎండు మిర్చి', hindi: 'सूखी मिर्च', aliases: ['endu mirchi', 'sookhi mirch', 'dry chilli', 'dry chili'] },

  // ── Leafy greens ──
  { name: 'Spinach', telugu: 'పాలకూర', hindi: 'पालक', aliases: ['palakura', 'palak', 'bachchali'] },
  { name: 'Coriander', telugu: 'కొత్తిమీర', hindi: 'धनिया', aliases: ['kothimeera', 'kothimir', 'kothimira', 'dhaniya', 'dhania'] },
  { name: 'Mint', telugu: 'పుదీనా', hindi: 'पुदीना', aliases: ['pudeena', 'pudina'] },
  { name: 'Curry leaves', telugu: 'కరివేపాకు', hindi: 'करी पत्ता', aliases: ['karivepak', 'karivepaku', 'karipatta', 'meetha neem'] },
  { name: 'Fenugreek leaves', telugu: 'మెంతికూర', hindi: 'मेथी', aliases: ['methi', 'mentikura', 'menthikura'] },
  { name: 'Roselle leaves', telugu: 'గోంగూర', hindi: 'गोंगुरा', aliases: ['gongura', 'puntikura'] },
  { name: 'Amaranthus', telugu: 'తొటకూర', hindi: 'चौलाई', aliases: ['thotakura', 'chukkakura', 'amaranthus', 'chaulai'] },
  { name: 'Water amaranth', telugu: 'పొన్నగంటి', hindi: '', aliases: ['ponnaganti'] },
  { name: 'Malabar spinach', telugu: 'బచ్చలి', hindi: '', aliases: ['bachchali kura', 'poigai'] },
  { name: 'Sorrel leaves', telugu: '', hindi: '', aliases: ['chukka kura', 'chukkakura'] },
  { name: 'Spring onion', telugu: '', hindi: 'हरा प्याज', aliases: ['hara pyaz', 'spring onion'] },
  { name: 'Lettuce', telugu: 'లెట్యూస్', hindi: 'सलाद पत्ता', aliases: ['lettuce', 'salad patta'] },
  { name: 'Celery', telugu: '', hindi: 'अजवायन', aliases: ['celery', 'ajwain patta'] },
  { name: 'Dill', telugu: 'సబసి', hindi: 'सोया', aliases: ['sabsige', 'soya', 'shepu'] },
  { name: 'Purslane', telugu: 'పిడుగు', hindi: '', aliases: ['pidugu', 'kulfa'] },
  { name: 'Mustard greens', telugu: '', hindi: 'सरसों', aliases: ['sarson', 'sarso'] },
  { name: 'Colocasia leaves', telugu: 'చామాకు', hindi: 'अरबी पत्ता', aliases: ['chama aaku', 'arbi patta'] },

  // ── Gourds ──
  { name: 'Ridge gourd', telugu: 'బీరకాయ', hindi: 'तोरई', aliases: ['beerakaya', 'torai', 'tori', 'turai'] },
  { name: 'Bottle gourd', telugu: 'సొరకాయ', hindi: 'लौकी', aliases: ['sorakaya', 'lauki', 'loki', 'gheeya'] },
  { name: 'Ash gourd', telugu: 'ఆనపకాయ', hindi: 'पेठा', aliases: ['anapakaya', 'gummadikaya', 'petha', 'white pumpkin'] },
  { name: 'Bitter gourd', telugu: 'కాకరకాయ', hindi: 'करेला', aliases: ['kakarkaya', 'karela'] },
  { name: 'Pumpkin', telugu: 'గుమ్మడికాయ', hindi: 'कद्दू', aliases: ['kaddu', 'gummadi'] },
  { name: 'Yellow pumpkin', telugu: 'పసుపు గుమ్మడి', hindi: 'पीला कद्दू', aliases: ['yellow pumpkin', 'peela kaddu'] },
  { name: 'Snake gourd', telugu: 'పొట్లకాయ', hindi: 'चिचिंडा', aliases: ['potlakaya', 'chichinda', 'padwal'] },
  { name: 'Pointed gourd', telugu: 'ముక్కల దోసకాయ', hindi: 'परवल', aliases: ['parval', 'parwal'] },
  { name: 'Ivy gourd', telugu: 'దొంగకాయ', hindi: 'कुंदरू', aliases: ['dongakaya', 'kundru', 'tindora', 'tendli'] },
  { name: 'Sponge gourd', telugu: 'నేతి బీర', hindi: 'तोरई', aliases: ['nethi beerakaya', 'loofah', 'tori'] },
  { name: 'Apple gourd', telugu: '', hindi: 'टिंडा', aliases: ['tinda', 'tindsi'] },
  { name: 'Round gourd', telugu: '', hindi: 'टिंडा', aliases: ['round gourd'] },
  { name: 'Bitter melon', telugu: 'కాకర', hindi: 'करेला', aliases: ['bitter melon', 'kakara'] },

  // ── Cucurbits & cucumber family ──
  { name: 'Cucumber', telugu: 'దోస', hindi: 'खीरा', aliases: ['cucumber', 'kheera', 'khira', 'dosakaya'] },
  { name: 'Yellow cucumber', telugu: 'దోసకాయ', hindi: 'ककड़ी', aliases: ['dosakaya', 'dosayaya', 'dosaaya', 'kakdi'] },
  { name: 'Bottle cucumber', telugu: '', hindi: '', aliases: ['bottle cucumber'] },
  { name: 'Muskmelon', telugu: 'ఖర్బూజ', hindi: 'खरबूज', aliases: ['kharbuja', 'kharbuj'] },
  { name: 'Watermelon', telugu: 'పుచ్చకాయ', hindi: 'तरबूज', aliases: ['puchakaya', 'tarbuj', 'tarbooz'] },

  // ── Root vegetables ──
  { name: 'Radish', telugu: 'ములంగి', hindi: 'मूली', aliases: ['radish', 'mullangi', 'mooli', 'muli', 'moolee', 'mullakada'] },
  { name: 'Carrot', telugu: 'క్యారెట్', hindi: 'गाजर', aliases: ['carrot', 'gajar', 'gaajar'] },
  { name: 'Beetroot', telugu: 'బీట్రూట్', hindi: 'चुकंदर', aliases: ['beetroot', 'chukandar', 'chukandhar'] },
  { name: 'Sweet potato', telugu: 'చిలగడదుంప', hindi: 'शकरकंद', aliases: ['chanagadda', 'chagadda', 'shakarkand', 'chilakada dumpa'] },
  { name: 'Taro root', telugu: 'చేమదుంప', hindi: 'अरबी', aliases: ['arbi', 'chemadumpa', 'kachalu'] },
  { name: 'Yam', telugu: 'పెండలం', hindi: 'सूरन', aliases: ['pendalam', 'suran', 'jimikand'] },
  { name: 'Elephant foot yam', telugu: 'పెండలం', hindi: 'सूरन', aliases: ['pendalam', 'suran'] },
  { name: 'Turnip', telugu: '', hindi: 'शलजम', aliases: ['shaljam', 'shalgam', 'soja'] },
  { name: 'Rutabaga', telugu: '', hindi: '', aliases: ['rutabaga', 'swede'] },
  { name: 'Arrowroot', telugu: 'అరరోట్', hindi: 'अरारोट', aliases: ['arrowroot'] },

  // ── Ginger & garlic family ──
  { name: 'Ginger', telugu: 'అల్లం', hindi: 'अदरक', aliases: ['allam', 'adrak', 'adarak'] },
  { name: 'Garlic', telugu: 'వెల్లుల్లి', hindi: 'लहसुन', aliases: ['vellulli', 'lahsun', 'lehsun'] },
  { name: 'Garlic chives', telugu: '', hindi: 'हरा लहसुन', aliases: ['garlic chives'] },
  { name: 'Galangal', telugu: '', hindi: 'कचोर', aliases: ['galangal', 'kachor'] },
  { name: 'Turmeric', telugu: 'పసుపు', hindi: 'हल्दी', aliases: ['pasupu', 'haldi', 'turmeric'] },

  // ── Cabbage family ──
  { name: 'Cabbage', telugu: 'క్యాబేజీ', hindi: 'पत्तागोभी', aliases: ['cabbage', 'pattagobhi'] },
  { name: 'Cauliflower', telugu: 'కాలీఫ్లవర్', hindi: 'फूलगोभी', aliases: ['cauliflower', 'gobhi', 'phoolgobhi'] },
  { name: 'Broccoli', telugu: 'బ్రోకలీ', hindi: 'ब्रोकली', aliases: ['broccoli'] },
  { name: 'Kohlrabi', telugu: '', hindi: 'गांठ गोभी', aliases: ['kohlrabi', 'ganthgobhi', 'navalkol'] },
  { name: 'Brussels sprouts', telugu: '', hindi: 'ब्रसेल्स स्प्राउट', aliases: ['brussels sprouts'] },
  { name: 'Bok choy', telugu: '', hindi: '', aliases: ['bok choy', 'pak choi'] },
  { name: 'Napa cabbage', telugu: '', hindi: 'चाइनीज कैबेज', aliases: ['napa cabbage', 'chinese cabbage'] },

  // ── Beans & peas ──
  { name: 'Beans', telugu: 'బీన్స్', hindi: 'बीन्स', aliases: ['beans', 'french beans'] },
  { name: 'Flat beans', telugu: 'చిక్కుడు', hindi: 'सेम', aliases: ['chikkudu', 'chikkudukaya', 'sem', 'broad beans'] },
  { name: 'Cluster beans', telugu: 'గోరు చిక్కుడు', hindi: 'ग्वार फली', aliases: ['goru chikkudu', 'guar', 'guar phali'] },
  { name: 'Yardlong beans', telugu: 'బొబ్బర కాయ', hindi: 'बरबटी', aliases: ['bobbara kaya', 'barbati', 'long beans', 'snake beans'] },
  { name: 'Lima beans', telugu: '', hindi: 'लोबिया', aliases: ['lima beans', 'lobia'] },
  { name: 'Soybean', telugu: 'సోయాబీన్స్', hindi: 'सोयाबीन', aliases: ['soybean', 'soya'] },
  { name: 'Peas', telugu: 'బటానీలు', hindi: 'मटर', aliases: ['matar', 'green peas', 'matar'] },
  { name: 'Snow peas', telugu: '', hindi: 'हरी मटर', aliases: ['snow peas', 'hara matar'] },
  { name: 'Edamame', telugu: '', hindi: 'एडामामे', aliases: ['edamame', 'soybean pods'] },
  { name: 'Cowpea', telugu: 'ఆలసందలు', hindi: 'लोबिया', aliases: ['alasandlu', 'cowpea', 'lobia', 'chawli'] },
  { name: 'Winged beans', telugu: '', hindi: '', aliases: ['winged beans'] },
  { name: 'Hyacinth beans', telugu: 'ఆవనిగూడు', hindi: 'सेम फली', aliases: ['avanikaya', 'sem phali'] },

  // ── Brinjal varieties ──
  { name: 'Brinjal', telugu: 'వంకాయ', hindi: 'बैंगन', aliases: ['brinjal', 'vankaya', 'baingan', 'eggplant'] },
  { name: 'Green brinjal', telugu: 'పచ్చ వంకాయ', hindi: 'हरा बैंगन', aliases: ['green brinjal', 'hara baingan'] },
  { name: 'Long brinjal', telugu: 'పొడవు వంకాయ', hindi: 'लंबा बैंगन', aliases: ['long brinjal', 'lamba baingan'] },
  { name: 'Round brinjal', telugu: 'గుండ్ర వంకాయ', hindi: 'गोल बैंगन', aliases: ['round brinjal', 'gol baingan'] },

  // ── Bell peppers ──
  { name: 'Capsicum', telugu: 'కాప్సికమ్', hindi: 'शिमला मिर्च', aliases: ['capsicum', 'shimlamirch', 'bell pepper'] },
  { name: 'Green capsicum', telugu: 'పచ్చ కాప్సికమ్', hindi: 'हरी शिमला मिर्च', aliases: ['green capsicum', 'green bell pepper'] },
  { name: 'Red capsicum', telugu: 'ఎర్ర కాప్సికమ్', hindi: 'लाल शिमला मिर्च', aliases: ['red capsicum', 'red bell pepper'] },
  { name: 'Yellow capsicum', telugu: 'పసుపు కాప్సికమ్', hindi: 'पीली शिमला मिर्च', aliases: ['yellow capsicum', 'yellow bell pepper'] },

  // ── Other common vegetables ──
  { name: 'Drumstick', telugu: 'మునగకాయ', hindi: 'सहजन', aliases: ['drumstick', 'munagakaya', 'sahjan', 'moringa'] },
  { name: 'Mushroom', telugu: 'మష్రూం', hindi: 'मशरूम', aliases: ['mashroom', 'mushroom'] },
  { name: 'Button mushroom', telugu: '', hindi: 'बटन मशरूम', aliases: ['button mushroom'] },
  { name: 'Oyster mushroom', telugu: '', hindi: 'ऑयस्टर मशरूम', aliases: ['oyster mushroom'] },

  // ── Specialty & regional vegetables ──
  { name: 'Jackfruit', telugu: 'పనసపండు', hindi: 'कथल', aliases: ['kathal', 'panasapandu', 'kathal'] },
  { name: 'Raw jackfruit', telugu: 'పచ్చ పనస', hindi: 'कच्चा कथल', aliases: ['raw jackfruit', 'kaccha kathal'] },
  { name: 'Breadfruit', telugu: '', hindi: 'ब्रेडफ्रूट', aliases: ['breadfruit'] },
  { name: 'Raw banana', telugu: 'పచ్చ అరటికాయ', hindi: 'कच्चा केला', aliases: ['raw banana', 'kaccha kela', 'green banana', 'plantain'] },
  { name: 'Banana flower', telugu: 'అరటి పువ్వు', hindi: 'केले का फूल', aliases: ['arati puvvu', 'kele ka phool', 'banana blossom'] },
  { name: 'Banana stem', telugu: 'అరటి దుంప', hindi: 'केले का तना', aliases: ['arati dumpa', 'kele ka tana'] },
  { name: 'Tinda', telugu: '', hindi: 'टिंडा', aliases: ['tinda', 'tindsi'] },
  { name: 'Kundru', telugu: 'దొంగ', hindi: 'कुंदरू', aliases: ['kundru', 'donga'] },
  { name: 'Papaya', telugu: 'బొప్పాయి', hindi: 'पपीता', aliases: ['boppayi', 'papaya', 'papita'] },
  { name: 'Raw papaya', telugu: 'పచ్చ బొప్పాయి', hindi: 'कच्चा पपीता', aliases: ['raw papaya', 'kaccha papita'] },
  { name: 'Lemon', telugu: 'నిమ్మ', hindi: 'नींबू', aliases: ['nimma', 'nimbu', 'lemon'] },
  { name: 'Lime', telugu: 'నిమ్మకాయ', hindi: 'नींबू', aliases: ['nimma kaya', 'lime'] },
  { name: 'Coconut', telugu: 'కొబ్బరి', hindi: 'नारियल', aliases: ['kobbari', 'nariyal', 'coconut'] },
  { name: 'Tender coconut', telugu: 'ఎలక్కాయ', hindi: 'नारियल पानी', aliases: ['elakaya', 'tender coconut', 'green coconut'] },

  // ── Sprouts & shoots ──
  { name: 'Bamboo shoots', telugu: 'బెదురు', hindi: 'बांस की कलियां', aliases: ['bamboo shoots', 'bamboo'] },
  { name: 'Bean sprouts', telugu: 'మొలికలు', hindi: 'अंकुरित बीन्स', aliases: ['bean sprouts', 'sprouts'] },
  { name: 'Alfalfa sprouts', telugu: '', hindi: '', aliases: ['alfalfa sprouts'] },

  // ── Other exotic / less common ──
  { name: 'Zucchini', telugu: '', hindi: 'ज़ुकीनी', aliases: ['zucchini', 'courgette'] },
  { name: 'Asparagus', telugu: '', hindi: 'अस्परैगस', aliases: ['asparagus', 'shatavari'] },
  { name: 'Artichoke', telugu: '', hindi: 'आर्टिचोक', aliases: ['artichoke'] },
  { name: 'Leek', telugu: '', hindi: 'लीक', aliases: ['leek'] },
  { name: 'Fennel bulb', telugu: '', hindi: 'सौंफ', aliases: ['fennel', 'saunf'] },
  { name: 'Endive', telugu: '', hindi: '', aliases: ['endive'] },
  { name: 'Radicchio', telugu: '', hindi: '', aliases: ['radicchio'] },
  { name: 'Arugula', telugu: '', hindi: '', aliases: ['arugula', 'rocket', 'roquette'] },
  { name: 'Kale', telugu: '', hindi: 'केल', aliases: ['kale'] },
  { name: 'Swiss chard', telugu: '', hindi: '', aliases: ['swiss chard', 'chard'] },
  { name: 'Collard greens', telugu: '', hindi: '', aliases: ['collard greens'] },
  { name: 'Okra leaves', telugu: 'బెండ ఆకు', hindi: '', aliases: ['benda aaku'] },
  { name: 'Sweet corn', telugu: 'మొక్కజొన్న', hindi: 'मक्का', aliases: ['sweet corn', 'makka', 'bhutta'] },
  { name: 'Baby corn', telugu: 'బేబీ కార్న్', hindi: 'बेबी कॉर्न', aliases: ['baby corn'] },
  { name: 'Corn', telugu: 'మొక్కజొన్న', hindi: 'मक्का', aliases: ['corn', 'makka'] },
  { name: 'Sorghum', telugu: 'జొన్న', hindi: 'ज्वार', aliases: ['jonna', 'jowar'] },
  { name: 'Bajra', telugu: 'సజ్జ', hindi: 'बाजरा', aliases: ['sajja', 'bajra', 'pearl millet'] },
  { name: 'Ragi', telugu: 'రాగులు', hindi: 'रागी', aliases: ['ragulu', 'ragi', 'finger millet'] },

  // ── Flowers & buds ──
  { name: 'Cauliflower leaves', telugu: 'కాలీఫ్లవర్ ఆకు', hindi: '', aliases: ['cauliflower leaves'] },
  { name: 'Moringa leaves', telugu: 'మునగ ఆకు', hindi: 'सहजन पत्ता', aliases: ['moringa leaves', 'munaga aaku'] },
  { name: 'Onion greens', telugu: 'ఉల్లి ఆకు', hindi: 'हरा प्याज', aliases: ['ulli aaku', 'hara pyaz', 'spring onion'] },
  { name: 'Garlic greens', telugu: 'వెల్లుల్లి ఆకు', hindi: 'हरा लहसुन', aliases: ['garlic greens'] },
];

/**
 * Seed the default vegetable catalog into the database for a shop.
 * Idempotent and race-safe: uses ON CONFLICT (shop_id, name) DO NOTHING
 * so concurrent calls won't fail. Returns the count of newly inserted items.
 */
export async function seedCatalog(shopId: string): Promise<number> {
  if (!isDbConfigured()) return 0;
  await ensureSchema();
  const sql = getSql();

  let inserted = 0;
  for (const veg of DEFAULT_VEGETABLES) {
    const [row] = await sql`
      INSERT INTO catalog_items (name, telugu_name, hindi_name, active, shop_id)
      VALUES (${veg.name}, ${veg.telugu || null}, ${veg.hindi || null}, true, ${shopId})
      ON CONFLICT (shop_id, name) DO NOTHING
      RETURNING id
    `;
    if (!row) continue;
    const itemId = (row as any).id as string;

    for (const alias of veg.aliases) {
      await sql`INSERT INTO catalog_aliases (item_id, alias, shop_id) VALUES (${itemId}, ${alias}, ${shopId}) ON CONFLICT DO NOTHING`;
    }
    inserted++;
  }

  return inserted;
}

export async function getCatalog(shopId: string): Promise<CatalogItem[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  // Always run seedCatalog — it's idempotent and only inserts missing items.
  // This ensures new vegetables added to DEFAULT_VEGETABLES show up on
  // existing shops without needing a manual migration.
  await seedCatalog(shopId);

  const items = await sql`SELECT * FROM catalog_items WHERE shop_id = ${shopId} ORDER BY name`;
  const aliases = await sql`SELECT * FROM catalog_aliases WHERE shop_id = ${shopId}`;

  const aliasesByItem = new Map<string, string[]>();
  for (const a of aliases) {
    const arr = aliasesByItem.get(a.item_id as string) || [];
    arr.push(a.alias as string);
    aliasesByItem.set(a.item_id as string, arr);
  }

  return (items as any[]).map((it) => ({
    id: it.id as string,
    name: it.name as string,
    defaultUnit: (it.default_unit as string) || null,
    defaultSellPrice: it.default_sell_price !== null ? Number(it.default_sell_price) : null,
    teluguName: (it.telugu_name as string) || null,
    hindiName: (it.hindi_name as string) || null,
    active: it.active !== false,
    aliases: aliasesByItem.get(it.id as string) || [],
  }));
}

export async function saveCatalogItem(shopId: string, item: Omit<CatalogItem, 'id'> & { id?: string }): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  if (item.id) {
    await sql`
      UPDATE catalog_items
      SET name = ${item.name},
          default_unit = ${item.defaultUnit || null},
          default_sell_price = ${item.defaultSellPrice || null},
          telugu_name = ${item.teluguName || null},
          hindi_name = ${item.hindiName || null},
          active = ${item.active}
      WHERE id = ${item.id} AND shop_id = ${shopId}
    `;
    await sql`DELETE FROM catalog_aliases WHERE item_id = ${item.id} AND shop_id = ${shopId}`;
    for (const alias of item.aliases) {
      await sql`INSERT INTO catalog_aliases (item_id, alias, shop_id) VALUES (${item.id}, ${alias}, ${shopId})`;
    }
  } else {
    const [row] = await sql`
      INSERT INTO catalog_items (name, default_unit, default_sell_price, telugu_name, hindi_name, active, shop_id)
      VALUES (${item.name}, ${item.defaultUnit || null}, ${item.defaultSellPrice || null}, ${item.teluguName || null}, ${item.hindiName || null}, ${item.active}, ${shopId})
      ON CONFLICT (shop_id, name) DO UPDATE SET
        default_unit = EXCLUDED.default_unit,
        default_sell_price = EXCLUDED.default_sell_price,
        telugu_name = EXCLUDED.telugu_name,
        hindi_name = EXCLUDED.hindi_name,
        active = EXCLUDED.active
      RETURNING id
    `;
    if (!row) throw new Error('Could not insert catalog item');
    for (const alias of item.aliases) {
      await sql`INSERT INTO catalog_aliases (item_id, alias, shop_id) VALUES (${row.id}, ${alias}, ${shopId})`;
    }
  }
}

export async function deleteCatalogItem(shopId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM catalog_aliases WHERE item_id = ${id} AND shop_id = ${shopId}`;
  await sql`DELETE FROM catalog_items WHERE id = ${id} AND shop_id = ${shopId}`;
}

/**
 * Returns a flat map of alias → item_name for all catalog items.
 * Used by the OCR parser to resolve raw text to confirmed names.
 */
export async function getAliasMap(shopId: string): Promise<Record<string, string>> {
  if (!isDbConfigured()) return {};
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ca.alias, ci.name
    FROM catalog_aliases ca
    JOIN catalog_items ci ON ca.item_id = ci.id
    WHERE ca.shop_id = ${shopId} AND ci.active = true
  `;
  const map: Record<string, string> = {};
  for (const r of rows as any[]) {
    map[(r.alias as string).toLowerCase().trim()] = r.name as string;
  }
  return map;
}

/**
 * Save a single alias (raw_text → confirmed_name) for the OCR learning system.
 * Creates the catalog item if it doesn't exist yet.
 */
export async function saveAlias(shopId: string, alias: string, itemName: string): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const sql = getSql();
  const cleanAlias = alias.trim();
  const cleanName = itemName.trim();
  if (!cleanAlias || !cleanName) return;

  // Find or create the catalog item
  const existing = await sql`SELECT id FROM catalog_items WHERE name = ${cleanName} AND shop_id = ${shopId} LIMIT 1`;
  let itemId: string;
  if (existing.length > 0) {
    itemId = (existing[0] as any).id;
  } else {
    const [row] = await sql`
      INSERT INTO catalog_items (name, active, shop_id)
      VALUES (${cleanName}, true, ${shopId})
      ON CONFLICT (shop_id, name) DO NOTHING
      RETURNING id
    `;
    if (!row) {
      // Item was created by a concurrent request — fetch its id
      const [existing2] = await sql`SELECT id FROM catalog_items WHERE name = ${cleanName} AND shop_id = ${shopId} LIMIT 1`;
      if (!existing2) return;
      itemId = (existing2 as any).id;
    } else {
      itemId = (row as any).id;
    }
  }

  // Check if alias already exists
  const dup = await sql`SELECT id FROM catalog_aliases WHERE item_id = ${itemId} AND alias = ${cleanAlias} AND shop_id = ${shopId} LIMIT 1`;
  if (dup.length > 0) return;

  await sql`INSERT INTO catalog_aliases (item_id, alias, shop_id) VALUES (${itemId}, ${cleanAlias}, ${shopId})`;
}

/* ---- Customer name aliases (self-learning) ---- */

export async function getCustomerAliasMap(shopId: string): Promise<Record<string, { name: string; id: string | null }>> {
  if (!isDbConfigured()) return {};
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT raw_name, customer_name, customer_id
    FROM customer_aliases
    WHERE shop_id = ${shopId}
  `;
  const map: Record<string, { name: string; id: string | null }> = {};
  for (const r of rows as any[]) {
    map[(r.raw_name as string).toLowerCase().trim()] = {
      name: r.customer_name as string,
      id: r.customer_id as string | null,
    };
  }
  return map;
}

export async function saveCustomerAlias(
  shopId: string,
  rawName: string,
  customerName: string,
  customerId: string | null = null,
): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const sql = getSql();
  const cleanRaw = rawName.trim();
  const cleanName = customerName.trim();
  if (!cleanRaw || !cleanName) return;
  // Upsert: if the raw_name already exists for this shop, update it
  await sql`
    INSERT INTO customer_aliases (shop_id, raw_name, customer_name, customer_id)
    VALUES (${shopId}, ${cleanRaw}, ${cleanName}, ${customerId})
    ON CONFLICT (shop_id, raw_name)
    DO UPDATE SET customer_name = ${cleanName}, customer_id = ${customerId}
  `;
}

/* ---- Rate history (self-learning) ---- */

export async function saveRate(
  shopId: string,
  commodity: string,
  rate: number,
  rateUnit: string,
  date: string,
): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const sql = getSql();
  const cleanCommodity = commodity.trim();
  if (!cleanCommodity || !rate || !date) return;
  await sql`
    INSERT INTO rate_history (shop_id, commodity, rate, rate_unit, date)
    VALUES (${shopId}, ${cleanCommodity}, ${rate}, ${rateUnit}, ${date})
  `;
}

export async function getRecentRates(
  shopId: string,
  commodity: string,
  limit = 5,
): Promise<{ rate: number; rateUnit: string; date: string }[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT rate, rate_unit, date
    FROM rate_history
    WHERE shop_id = ${shopId} AND commodity = ${commodity.trim()}
    ORDER BY date DESC, created_at DESC
    LIMIT ${limit}
  `;
  return (rows as any[]).map((r) => ({
    rate: parseFloat(r.rate),
    rateUnit: r.rate_unit,
    date: typeof r.date === 'string' ? r.date : (r.date as Date).toISOString().slice(0, 10),
  }));
}

// ---- Hamali rates (Bowenpally market yard, 2024) ----

export interface HamaliRate {
  id: string;
  slNo: number;
  label: string;
  matchKeywords: string[];
  weightMinKg: number | null;
  weightMaxKg: number | null;
  sellerShare: number;
  purchaserShare: number;
  unit: string;
}

const DEFAULT_HAMALI_RATES: Omit<HamaliRate, 'id'>[] = [
  { slNo: 1, label: '25kg to 70kg boxes/bags', matchKeywords: ['vegetable', 'produce', 'generic'], weightMinKg: 25, weightMaxKg: 70, sellerShare: 5.95, purchaserShare: 11.83, unit: 'per_bag' },
  { slNo: 2, label: '5kg to 25kg', matchKeywords: ['vegetable', 'produce', 'generic'], weightMinKg: 5, weightMaxKg: 25, sellerShare: 4.80, purchaserShare: 11.23, unit: 'per_bag' },
  { slNo: 3, label: 'Tomato per box (Bangalore, Sholapur, Pune, Nanded, Madanapalli)', matchKeywords: ['tomato', 'tamatar'], weightMinKg: null, weightMaxKg: null, sellerShare: 4.14, purchaserShare: 6.83, unit: 'per_box' },
  { slNo: 4, label: 'Tomato open (per box)', matchKeywords: ['tomato', 'tamatar', 'open'], weightMinKg: null, weightMaxKg: null, sellerShare: 3.56, purchaserShare: 4.32, unit: 'per_box' },
  { slNo: 5, label: 'Onion/Green peas/Mango — All baskets and Bejwada snake vegetables', matchKeywords: ['onion', 'peas', 'mango', 'snake', 'basket', 'bejwada'], weightMinKg: null, weightMaxKg: null, sellerShare: 4.80, purchaserShare: 11.23, unit: 'per_bag' },
  { slNo: 6, label: 'Heaps of Bottle Gourd / Cauliflower and Beetroot bags', matchKeywords: ['bottle gourd', 'cauliflower', 'beetroot', 'heap'], weightMinKg: null, weightMaxKg: null, sellerShare: 3.56, purchaserShare: 8.64, unit: 'per_bag' },
  { slNo: 7, label: 'Potato per bag (50kg to 70kg)', matchKeywords: ['potato', 'aloo'], weightMinKg: 50, weightMaxKg: 70, sellerShare: 5.95, purchaserShare: 11.23, unit: 'per_bag' },
  { slNo: 8, label: 'Green Plantain (Banana)', matchKeywords: ['banana', 'plantain', 'arati'], weightMinKg: null, weightMaxKg: null, sellerShare: 2.97, purchaserShare: 9.94, unit: 'per_bag' },
  { slNo: 9, label: 'Own purchased chillies — vehicle crossing for one bag', matchKeywords: ['chilli', 'chili', 'mirchi'], weightMinKg: null, weightMaxKg: null, sellerShare: 0, purchaserShare: 7.43, unit: 'per_bag' },
  { slNo: 10, label: 'Up to 5 tonnes vehicle (DCM vans)', matchKeywords: ['dcm', 'van', 'vehicle'], weightMinKg: null, weightMaxKg: null, sellerShare: 0, purchaserShare: 198.72, unit: 'per_vehicle' },
  { slNo: 11, label: 'Big lorries up to 10 tonnes', matchKeywords: ['lorry', 'truck', 'big'], weightMinKg: null, weightMaxKg: null, sellerShare: 0, purchaserShare: 349.06, unit: 'per_vehicle' },
];

export async function getHamaliRates(shopId: string): Promise<HamaliRate[]> {
  if (!isDbConfigured()) return DEFAULT_HAMALI_RATES.map((r, i) => ({ ...r, id: `default-${i}` }));
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM hamali_rates WHERE (shop_id = ${shopId} OR shop_id IS NULL) ORDER BY sort_order, sl_no`;
  if (rows.length === 0) {
    // Seed default rates on first access
    for (const r of DEFAULT_HAMALI_RATES) {
      await sql`
        INSERT INTO hamali_rates (shop_id, sl_no, label, match_keywords, weight_min_kg, weight_max_kg, seller_share, purchaser_share, unit, sort_order)
        VALUES (${shopId}, ${r.slNo}, ${r.label}, ${r.matchKeywords}, ${r.weightMinKg}, ${r.weightMaxKg}, ${r.sellerShare}, ${r.purchaserShare}, ${r.unit}, ${r.slNo})
      `;
    }
    const seeded = await sql`SELECT * FROM hamali_rates WHERE shop_id = ${shopId} ORDER BY sort_order, sl_no`;
    return (seeded as any[]).map(toHamaliRate);
  }
  return (rows as any[]).map(toHamaliRate);
}

function toHamaliRate(r: any): HamaliRate {
  return {
    id: r.id as string,
    slNo: r.sl_no as number,
    label: r.label as string,
    matchKeywords: (r.match_keywords as string[]) || [],
    weightMinKg: r.weight_min_kg != null ? parseFloat(r.weight_min_kg) : null,
    weightMaxKg: r.weight_max_kg != null ? parseFloat(r.weight_max_kg) : null,
    sellerShare: parseFloat(r.seller_share),
    purchaserShare: parseFloat(r.purchaser_share),
    unit: r.unit as string,
  };
}

/**
 * Calculate hamali for a given commodity and weight.
 * Returns the total hamali (seller + purchaser share) for all bags.
 * Weight brackets in the rate table are PER BAG (e.g. 25-70kg per bag),
 * so we divide total weight by bag count to find the per-bag weight.
 */
export function calculateHamali(
  commodity: string,
  weightKg: number | null,
  rates: HamaliRate[],
  bags: number = 1,
): { total: number; seller: number; purchaser: number; label: string } {
  const lowerCommodity = commodity.toLowerCase().trim();
  // Per-bag weight for bracket matching (weight brackets are per bag)
  const perBagKg = weightKg != null && bags > 0 ? weightKg / bags : null;

  // 1. Try keyword match first (specific commodities like tomato, potato, etc.)
  let bestMatch: HamaliRate | null = null;
  for (const r of rates) {
    if (r.matchKeywords.some((kw) => lowerCommodity.includes(kw.toLowerCase()))) {
      // Check weight bracket if the rate has one (using per-bag weight)
      if (r.weightMinKg != null && r.weightMaxKg != null && perBagKg != null) {
        if (perBagKg >= r.weightMinKg && perBagKg <= r.weightMaxKg) {
          bestMatch = r;
          break;
        }
      } else if (r.weightMinKg == null && r.weightMaxKg == null) {
        // No weight bracket on this rate — match by keyword alone
        bestMatch = r;
        break;
      }
    }
  }

  // 2. Fall back to generic weight-based rates (using per-bag weight)
  if (!bestMatch && perBagKg != null) {
    for (const r of rates) {
      if (r.matchKeywords.includes('generic') || r.matchKeywords.includes('vegetable') || r.matchKeywords.includes('produce')) {
        if (r.weightMinKg != null && r.weightMaxKg != null) {
          if (perBagKg >= r.weightMinKg && perBagKg <= r.weightMaxKg) {
            bestMatch = r;
            break;
          }
        }
      }
    }
  }

  // 3. Fall back to generic rate ignoring weight bracket (e.g. very heavy bags > 70kg)
  if (!bestMatch) {
    for (const r of rates) {
      if (r.matchKeywords.includes('generic') || r.matchKeywords.includes('vegetable') || r.matchKeywords.includes('produce')) {
        if (r.weightMinKg == null && r.weightMaxKg == null) {
          bestMatch = r;
          break;
        }
      }
    }
  }

  // 4. Fall back to first rate (25-70kg bracket as default)
  if (!bestMatch && rates.length > 0) {
    bestMatch = rates[0];
  }

  if (!bestMatch) {
    return { total: 0, seller: 0, purchaser: 0, label: 'No rate found' };
  }

  const seller = bestMatch.sellerShare * bags;
  const purchaser = bestMatch.purchaserShare * bags;
  return {
    total: Math.round((seller + purchaser) * 100) / 100,
    seller,
    purchaser,
    label: bestMatch.label,
  };
}

export async function getLatestRate(
  shopId: string,
  commodity: string,
): Promise<{ rate: number; rateUnit: string; date: string } | null> {
  const rates = await getRecentRates(shopId, commodity, 1);
  return rates[0] || null;
}

/* ---- Stock levels ---- */

export async function getStock(shopId: string): Promise<StockLevel[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  // Aggregate purchased quantities from purchase_items
  const purchases = await sql`
    SELECT pi.name, pi.qty, pi.rate, p.date
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE (pi.kind = 'item' OR pi.kind IS NULL) AND pi.shop_id = ${shopId}
    ORDER BY p.date DESC
  `;

  // Aggregate sold quantities from bill_items
  const sales = await sql`
    SELECT bi.confirmed_name as name, bi.qty, t.date
    FROM bill_items bi
    JOIN transactions t ON bi.transaction_id = t.id
    WHERE (bi.kind = 'item' OR bi.kind IS NULL) AND bi.shop_id = ${shopId}
  `;

  // Aggregate wastage
  const wastage = await sql`SELECT item_name as name, qty, unit FROM wastage WHERE shop_id = ${shopId}`;

  const stock = new Map<string, { name: string; qty: number; unit: string | null; lastDate: string | null; lastRate: number | null }>();

  const { parseQty, qtyBasis, parseRate, itemKey } = await import('./units');

  for (const p of purchases as any[]) {
    const key = itemKey(p.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(p.qty));
    const entry = stock.get(key) || { name: p.name, qty: 0, unit: basis?.unit || null, lastDate: null, lastRate: null };
    if (basis) {
      entry.qty += basis.value;
      entry.unit = basis.unit;
    }
    const rate = parseRate(p.rate);
    if (rate && (!entry.lastDate || String(p.date).slice(0, 10) >= entry.lastDate)) {
      entry.lastRate = rate.value;
      entry.lastDate = String(p.date).slice(0, 10);
    }
    stock.set(key, entry);
  }

  for (const s of sales as any[]) {
    const key = itemKey(s.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(s.qty));
    const entry = stock.get(key);
    if (entry && basis) {
      entry.qty -= basis.value;
    }
  }

  for (const w of wastage as any[]) {
    const key = itemKey(w.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(w.qty));
    const entry = stock.get(key);
    if (entry && basis) {
      entry.qty -= basis.value;
    }
  }

  return [...stock.entries()]
    .map(([key, v]) => ({
      itemKey: key,
      itemName: v.name,
      unit: v.unit,
      qty: Math.round(v.qty * 100) / 100,
      lastPurchaseDate: v.lastDate,
      lastRate: v.lastRate,
    }))
    .filter((s) => s.qty !== 0)
    .sort((a, b) => b.qty - a.qty);
}

/* ---- Expenses ---- */

export async function getExpenses(shopId: string): Promise<ExpenseEntry[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM expenses WHERE shop_id = ${shopId} ORDER BY date DESC, created_at DESC`;
  return (rows as any[]).map((r) => ({
    id: r.id as string,
    date: toDateOnly(r.date),
    category: r.category as string,
    description: (r.description as string) || '',
    amount: Number(r.amount) || 0,
  }));
}

export async function saveExpense(shopId: string, entry: Omit<ExpenseEntry, 'id'>): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO expenses (date, category, description, amount, shop_id)
    VALUES (${entry.date}, ${entry.category}, ${entry.description || null}, ${entry.amount}, ${shopId})
  `;
}

export async function deleteExpense(shopId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM expenses WHERE id = ${id} AND shop_id = ${shopId}`;
}

/* ---- Customer credit limit ---- */

export async function setCustomerCreditLimit(shopId: string, id: string, limit: number | null): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE customers SET credit_limit = ${limit} WHERE id = ${id} AND shop_id = ${shopId}`;
}

/* ---- Data backup/restore ---- */

export async function exportAllData(shopId: string) {
  await ensureSchema();
  const sql = getSql();
  const [customers, transactions, billItems, purchases, purchaseItems, suppliers, supplierPayments, wastage, catalogItems, catalogAliases, expenses, customerAliases, rateHistory] = await Promise.all([
    sql`SELECT id, name, english_name, telugu_name, hindi_name, phone, credit_limit FROM customers WHERE shop_id = ${shopId} ORDER BY name`,
    sql`SELECT * FROM transactions WHERE shop_id = ${shopId} ORDER BY date, created_at`,
    sql`SELECT * FROM bill_items WHERE shop_id = ${shopId} ORDER BY transaction_id, id`,
    sql`SELECT * FROM purchases WHERE shop_id = ${shopId} ORDER BY date, created_at`,
    sql`SELECT * FROM purchase_items WHERE shop_id = ${shopId} ORDER BY purchase_id, id`,
    sql`SELECT * FROM suppliers WHERE shop_id = ${shopId} ORDER BY name`,
    sql`SELECT * FROM supplier_payments WHERE shop_id = ${shopId} ORDER BY date, created_at`,
    sql`SELECT * FROM wastage WHERE shop_id = ${shopId} ORDER BY date, created_at`,
    sql`SELECT * FROM catalog_items WHERE shop_id = ${shopId} ORDER BY name`,
    sql`SELECT * FROM catalog_aliases WHERE shop_id = ${shopId} ORDER BY item_id, id`,
    sql`SELECT * FROM expenses WHERE shop_id = ${shopId} ORDER BY date, created_at`,
    sql`SELECT * FROM customer_aliases WHERE shop_id = ${shopId} ORDER BY raw_name`,
    sql`SELECT * FROM rate_history WHERE shop_id = ${shopId} ORDER BY commodity, date DESC`,
  ]);
  return {
    exportedAt: new Date().toISOString(),
    customers,
    transactions,
    billItems,
    purchases,
    purchaseItems,
    suppliers,
    supplierPayments,
    wastage,
    catalogItems,
    catalogAliases,
    expenses,
    customerAliases,
    rateHistory,
  };
}

/* ---- App settings (key-value) ---- */

export async function getSetting(shopId: string, key: string): Promise<string | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${key} AND shop_id = ${shopId}`;
  return (rows[0] as any)?.value ?? null;
}

export async function getAllSettings(shopId: string): Promise<Record<string, string>> {
  if (!isDbConfigured()) return {};
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT key, value FROM app_settings WHERE shop_id = ${shopId}`;
  const out: Record<string, string> = {};
  for (const r of rows as any[]) {
    out[r.key] = r.value;
  }
  return out;
}

export async function setSetting(shopId: string, key: string, value: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO app_settings (key, value, updated_at, shop_id)
    VALUES (${key}, ${value}, now(), ${shopId})
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now(), shop_id = ${shopId}
  `;
}

/* ---- Restore from backup ---- */

export async function restoreAllData(shopId: string, data: any): Promise<{ restored: string[] }> {
  await ensureSchema();
  const sql = getSql();

  const restored: string[] = [];

  // Validate required tables exist in backup
  const required = ['customers', 'transactions', 'billItems'];
  for (const k of required) {
    if (!Array.isArray(data[k])) throw new Error(`Invalid backup: missing ${k}`);
  }

  // Wipe existing data for this shop only, in dependency order
  await sql`DELETE FROM rate_history WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM customer_aliases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM catalog_aliases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM catalog_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM wastage WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM supplier_payments WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM purchase_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM purchases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM bill_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM transactions WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM expenses WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM customers WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM suppliers WHERE shop_id = ${shopId}`;

  // Restore customers first (other tables depend on them)
  if (Array.isArray(data.customers)) {
    for (const c of data.customers) {
      await sql`INSERT INTO customers (id, name, phone, credit_limit, shop_id) VALUES (${c.id}, ${c.name}, ${c.phone ?? null}, ${c.credit_limit ?? null}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`customers (${data.customers.length})`);
  }

  // Suppliers
  if (Array.isArray(data.suppliers)) {
    for (const s of data.suppliers) {
      await sql`INSERT INTO suppliers (id, name, phone, shop_id) VALUES (${s.id}, ${s.name}, ${s.phone ?? null}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`suppliers (${data.suppliers.length})`);
  }

  // Transactions
  if (Array.isArray(data.transactions)) {
    for (const t of data.transactions) {
      await sql`INSERT INTO transactions (id, customer_id, date, type, amount, bill_no, market_notes, created_at, shop_id) VALUES (${t.id}, ${t.customer_id}, ${t.date}, ${t.type}, ${t.amount}, ${t.bill_no ?? null}, ${t.market_notes ?? null}, ${t.created_at ?? new Date().toISOString()}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`transactions (${data.transactions.length})`);
  }

  // Bill items
  if (Array.isArray(data.billItems)) {
    for (const b of data.billItems) {
      await sql`INSERT INTO bill_items (id, transaction_id, name, qty, rate, amount, display, kind, charge_code, shop_id) VALUES (${b.id}, ${b.transaction_id}, ${b.name}, ${b.qty ?? null}, ${b.rate ?? null}, ${b.amount}, ${b.display ?? null}, ${b.kind ?? 'item'}, ${b.charge_code ?? null}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`bill_items (${data.billItems.length})`);
  }

  // Purchases
  if (Array.isArray(data.purchases)) {
    for (const p of data.purchases) {
      await sql`INSERT INTO purchases (id, date, supplier, supplier_id, bill_no, total, notes, created_at, shop_id) VALUES (${p.id}, ${p.date}, ${p.supplier ?? null}, ${p.supplier_id ?? null}, ${p.bill_no ?? null}, ${p.total ?? 0}, ${p.notes ?? null}, ${p.created_at ?? new Date().toISOString()}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`purchases (${data.purchases.length})`);
  }

  // Purchase items
  if (Array.isArray(data.purchaseItems)) {
    for (const pi of data.purchaseItems) {
      await sql`INSERT INTO purchase_items (id, purchase_id, name, qty, rate, amount, kind, charge_code, shop_id) VALUES (${pi.id}, ${pi.purchase_id}, ${pi.name}, ${pi.qty ?? null}, ${pi.rate ?? null}, ${pi.amount ?? 0}, ${pi.kind ?? 'item'}, ${pi.charge_code ?? null}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`purchase_items (${data.purchaseItems.length})`);
  }

  // Supplier payments
  if (Array.isArray(data.supplierPayments)) {
    for (const sp of data.supplierPayments) {
      await sql`INSERT INTO supplier_payments (id, supplier_id, date, amount, notes, shop_id) VALUES (${sp.id}, ${sp.supplier_id}, ${sp.date}, ${sp.amount}, ${sp.notes ?? null}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`supplier_payments (${data.supplierPayments.length})`);
  }

  // Wastage
  if (Array.isArray(data.wastage)) {
    for (const w of data.wastage) {
      await sql`INSERT INTO wastage (id, date, item_name, qty, unit, reason, est_cost, shop_id) VALUES (${w.id}, ${w.date}, ${w.item_name}, ${w.qty ?? null}, ${w.unit ?? null}, ${w.reason ?? null}, ${w.est_cost ?? 0}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`wastage (${data.wastage.length})`);
  }

  // Catalog items
  if (Array.isArray(data.catalogItems)) {
    for (const ci of data.catalogItems) {
      await sql`INSERT INTO catalog_items (id, name, default_unit, default_sell_price, telugu_name, hindi_name, active, shop_id) VALUES (${ci.id}, ${ci.name}, ${ci.default_unit ?? null}, ${ci.default_sell_price ?? null}, ${ci.telugu_name ?? null}, ${ci.hindi_name ?? null}, ${ci.active ?? true}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`catalog_items (${data.catalogItems.length})`);
  }

  // Catalog aliases
  if (Array.isArray(data.catalogAliases)) {
    for (const ca of data.catalogAliases) {
      await sql`INSERT INTO catalog_aliases (id, item_id, alias, shop_id) VALUES (${ca.id}, ${ca.item_id}, ${ca.alias}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`catalog_aliases (${data.catalogAliases.length})`);
  }

  // Expenses
  if (Array.isArray(data.expenses)) {
    for (const e of data.expenses) {
      await sql`INSERT INTO expenses (id, date, category, description, amount, shop_id) VALUES (${e.id}, ${e.date}, ${e.category}, ${e.description ?? null}, ${e.amount}, ${shopId}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`expenses (${data.expenses.length})`);
  }

  // Customer aliases (self-learning)
  if (Array.isArray(data.customerAliases)) {
    for (const ca of data.customerAliases) {
      await sql`INSERT INTO customer_aliases (id, shop_id, raw_name, customer_name, customer_id) VALUES (${ca.id}, ${shopId}, ${ca.raw_name}, ${ca.customer_name}, ${ca.customer_id ?? null}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`customer_aliases (${data.customerAliases.length})`);
  }

  // Rate history (self-learning)
  if (Array.isArray(data.rateHistory)) {
    for (const rh of data.rateHistory) {
      await sql`INSERT INTO rate_history (id, shop_id, commodity, rate, rate_unit, date) VALUES (${rh.id}, ${shopId}, ${rh.commodity}, ${rh.rate}, ${rh.rate_unit ?? 'per_kg'}, ${rh.date}) ON CONFLICT (id) DO NOTHING`;
    }
    restored.push(`rate_history (${data.rateHistory.length})`);
  }

  return { restored };
}

/* ---- Clear old data ---- */

export async function clearDataBefore(shopId: string, date: string): Promise<{ deleted: number }> {
  await ensureSchema();
  const sql = getSql();
  // Delete bill_items for transactions before date
  const oldTxns = await sql`SELECT id FROM transactions WHERE date < ${date} AND shop_id = ${shopId}`;
  const txnIds = oldTxns.map((r: any) => r.id);
  let deleted = 0;
  if (txnIds.length > 0) {
    // Delete in batches
    for (const tid of txnIds) {
      await sql`DELETE FROM bill_items WHERE transaction_id = ${tid} AND shop_id = ${shopId}`;
    }
    await sql`DELETE FROM transactions WHERE date < ${date} AND shop_id = ${shopId}`;
    deleted += txnIds.length;
  }
  // Also clear old purchases, wastage, expenses, supplier payments
  await sql`DELETE FROM purchase_items WHERE purchase_id IN (SELECT id FROM purchases WHERE date < ${date} AND shop_id = ${shopId}) AND shop_id = ${shopId}`;
  await sql`DELETE FROM purchases WHERE date < ${date} AND shop_id = ${shopId}`;
  await sql`DELETE FROM wastage WHERE date < ${date} AND shop_id = ${shopId}`;
  await sql`DELETE FROM expenses WHERE date < ${date} AND shop_id = ${shopId}`;
  await sql`DELETE FROM supplier_payments WHERE date < ${date} AND shop_id = ${shopId}`;
  return { deleted };
}

export async function clearAllData(shopId: string): Promise<{ deleted: number }> {
  await ensureSchema();
  const sql = getSql();
  const counts = await Promise.all([
    sql`SELECT count(*)::int as c FROM bill_items WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM transactions WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM purchase_items WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM purchases WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM wastage WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM expenses WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM supplier_payments WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM catalog_aliases WHERE shop_id = ${shopId}`,
    sql`SELECT count(*)::int as c FROM catalog_items WHERE shop_id = ${shopId}`,
  ]);
  let deleted = 0;
  for (const c of counts) deleted += (c[0] as any).c;

  await sql`DELETE FROM catalog_aliases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM catalog_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM wastage WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM supplier_payments WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM purchase_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM purchases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM bill_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM transactions WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM expenses WHERE shop_id = ${shopId}`;
  // Keep customers and suppliers (they are master data)
  return { deleted };
}

/* ---- Daily operations summary ---- */

export async function getDailySummary(shopId: string, date: string): Promise<DailySummary> {
  if (!isDbConfigured()) {
    return { date, purchased: 0, purchaseCount: 0, sold: 0, saleCount: 0, collected: 0, supplierPaid: 0, expenses: 0, wastageCost: 0, netCash: 0, cogs: 0, grossProfit: 0, estProfit: 0, stockValue: 0 };
  }
  await ensureSchema();
  const sql = getSql();

  const { parseQty, qtyBasis, parseRate, itemKey } = await import('./units');

  // Purchases today
  const purchases = await sql`SELECT id, total FROM purchases WHERE date = ${date} AND shop_id = ${shopId}`;
  const purchased = (purchases as any[]).reduce((s, p) => s + Number(p.total), 0);

  // Sales + collections today (from transactions)
  const txns = await sql`SELECT bill_amount, amount_paid FROM transactions WHERE date = ${date} AND shop_id = ${shopId}`;
  const sold = (txns as any[]).reduce((s, t) => s + (Number(t.bill_amount) > 0 ? Number(t.bill_amount) : 0), 0);
  const saleCount = (txns as any[]).filter((t) => Number(t.bill_amount) > 0).length;
  const collected = (txns as any[]).reduce((s, t) => s + (Number(t.amount_paid) > 0 ? Number(t.amount_paid) : 0), 0);

  // Supplier payments today
  const supPayments = await sql`SELECT amount FROM supplier_payments WHERE date = ${date} AND shop_id = ${shopId}`;
  const supplierPaid = (supPayments as any[]).reduce((s, p) => s + Number(p.amount), 0);

  // Expenses today
  const expenses = await sql`SELECT amount FROM expenses WHERE date = ${date} AND shop_id = ${shopId}`;
  const expensesTotal = (expenses as any[]).reduce((s, e) => s + Number(e.amount), 0);

  // Wastage today
  const wastage = await sql`SELECT est_cost FROM wastage WHERE date = ${date} AND shop_id = ${shopId}`;
  const wastageCost = (wastage as any[]).reduce((s, w) => s + Number(w.est_cost), 0);

  // ---- Actual COGS calculation ----
  // For each item sold today, multiply sold quantity by the average purchase rate
  // for that item (from all purchases, not just today's — because you might sell
  // stock bought on a previous day). This gives the true cost of goods sold.

  // Get all purchase items ever (to compute avg buy rate per item)
  const purchaseItems = await sql`
    SELECT pi.name, pi.qty, pi.rate
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE (pi.kind = 'item' OR pi.kind IS NULL) AND pi.shop_id = ${shopId}
  `;

  // Build per-item average purchase rate (rate per kg or per unit)
  const buyStats = new Map<string, { totalValue: number; totalQty: number; unit: string | null }>();
  for (const pi of purchaseItems as any[]) {
    const key = itemKey(pi.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(pi.qty));
    const rate = parseRate(pi.rate);
    if (!basis || !rate) continue;
    const entry = buyStats.get(key) || { totalValue: 0, totalQty: 0, unit: basis.unit };
    // rate.value is per single unit; basis.value is in kg or count
    entry.totalValue += rate.value * basis.value;
    entry.totalQty += basis.value;
    entry.unit = basis.unit;
    buyStats.set(key, entry);
  }

  // Get items sold today
  const soldItems = await sql`
    SELECT bi.confirmed_name as name, bi.qty, bi.amount
    FROM bill_items bi
    JOIN transactions t ON bi.transaction_id = t.id
    WHERE (bi.kind = 'item' OR bi.kind IS NULL) AND t.date = ${date} AND bi.shop_id = ${shopId}
  `;

  // Calculate COGS: for each sold item, sold_qty × avg_buy_rate_per_unit
  let cogs = 0;
  for (const si of soldItems as any[]) {
    const key = itemKey(si.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(si.qty));
    if (!basis) continue;
    const buy = buyStats.get(key);
    if (buy && buy.totalQty > 0) {
      const avgRate = buy.totalValue / buy.totalQty;
      cogs += avgRate * basis.value;
    }
  }

  // Calculate stock value (unsold stock × avg buy rate)
  // Reuse getStock but compute value here for efficiency
  let stockValue = 0;
  const stockMap = new Map<string, { qty: number; unit: string | null }>();

  for (const pi of purchaseItems as any[]) {
    const key = itemKey(pi.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(pi.qty));
    if (!basis) continue;
    const entry = stockMap.get(key) || { qty: 0, unit: basis.unit };
    entry.qty += basis.value;
    entry.unit = basis.unit;
    stockMap.set(key, entry);
  }

  // Subtract all sold items (not just today's)
  const allSoldItems = await sql`
    SELECT bi.confirmed_name as name, bi.qty
    FROM bill_items bi
    JOIN transactions t ON bi.transaction_id = t.id
    WHERE (bi.kind = 'item' OR bi.kind IS NULL) AND bi.shop_id = ${shopId}
  `;
  for (const si of allSoldItems as any[]) {
    const key = itemKey(si.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(si.qty));
    if (!basis) continue;
    const entry = stockMap.get(key);
    if (entry) entry.qty -= basis.value;
  }

  // Subtract wastage
  const allWastage = await sql`SELECT item_name as name, qty FROM wastage WHERE shop_id = ${shopId}`;
  for (const w of allWastage as any[]) {
    const key = itemKey(w.name);
    if (!key) continue;
    const basis = qtyBasis(parseQty(w.qty));
    if (!basis) continue;
    const entry = stockMap.get(key);
    if (entry) entry.qty -= basis.value;
  }

  // Value the remaining stock
  for (const [key, entry] of stockMap) {
    if (entry.qty > 0) {
      const buy = buyStats.get(key);
      if (buy && buy.totalQty > 0) {
        stockValue += (buy.totalValue / buy.totalQty) * entry.qty;
      }
    }
  }

  const netCash = collected - supplierPaid - expensesTotal;
  const grossProfit = sold - cogs;
  const estProfit = sold - purchased; // legacy, kept for reference

  return {
    date,
    purchased,
    purchaseCount: purchases.length,
    sold,
    saleCount,
    collected,
    supplierPaid,
    expenses: expensesTotal,
    wastageCost,
    netCash,
    cogs,
    grossProfit,
    estProfit,
    stockValue,
  };
}

/* ---- Item rate history for a date (price tracking through the day) ---- */

export async function getItemRateHistory(shopId: string, date: string): Promise<ItemRateHistory[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  // Get all bill items for the given date, with transaction created_at for time
  const rows = await sql`
    SELECT bi.confirmed_name as name, bi.qty, bi.rate, bi.amount, t.bill_no, t.created_at, c.name as customer_name
    FROM bill_items bi
    JOIN transactions t ON bi.transaction_id = t.id
    JOIN customers c ON t.customer_id = c.id
    WHERE t.date = ${date}
      AND (bi.kind = 'item' OR bi.kind IS NULL)
      AND bi.shop_id = ${shopId}
    ORDER BY t.created_at ASC
  `;

  const { parseRate, itemKey } = await import('./units');

  const byItem = new Map<string, ItemRateEntry[]>();
  const nameMap = new Map<string, string>();

  for (const r of rows as any[]) {
    const key = itemKey(r.name);
    if (!key) continue;
    const rate = parseRate(r.rate);
    if (!rate || rate.value <= 0) continue;

    const createdAt = r.created_at;
    let timeStr = '';
    if (createdAt) {
      const d = new Date(createdAt);
      timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    const entry: ItemRateEntry = {
      itemName: r.name,
      time: timeStr,
      rate: rate.value,
      qty: (r.qty as string) || null,
      customerName: r.customer_name,
      billNo: (r.bill_no as string) || null,
    };

    const arr = byItem.get(key) || [];
    arr.push(entry);
    byItem.set(key, arr);
    nameMap.set(key, r.name);
  }

  const out: ItemRateHistory[] = [];
  for (const [key, entries] of byItem) {
    const rates = entries.map((e) => e.rate);
    const firstRate = rates[0] ?? null;
    const lastRate = rates[rates.length - 1] ?? null;
    const minRate = rates.length > 0 ? Math.min(...rates) : null;
    const maxRate = rates.length > 0 ? Math.max(...rates) : null;

    let trend: 'up' | 'down' | 'flat' | 'mixed' = 'flat';
    if (entries.length >= 2) {
      if (firstRate! > lastRate!) trend = 'down';
      else if (firstRate! < lastRate!) trend = 'up';
      else {
        // Check if rates are all the same or mixed
        const allSame = rates.every((r) => r === rates[0]);
        trend = allSame ? 'flat' : 'mixed';
      }
    }

    out.push({
      itemName: nameMap.get(key) || key,
      entries,
      firstRate,
      lastRate,
      minRate,
      maxRate,
      trend,
    });
  }

  return out.sort((a, b) => a.itemName.localeCompare(b.itemName));
}

/* ---- Overdue customers for batch reminders ---- */

export async function getOverdueCustomers(shopId: string, minDays = 1): Promise<OverdueCustomer[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  const customers = await getCustomers(shopId);
  const now = new Date();

  const out: OverdueCustomer[] = [];
  for (const c of customers) {
    if (c.due <= 0.5) continue;

    // Compute aging
    const bills = c.txns
      .filter((t) => t.type === 'bill')
      .map((t) => ({ date: t.date, remaining: t.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let pool = c.txns.filter((t) => t.type === 'payment').reduce((s, t) => s + t.amount, 0);
    for (const bill of bills) {
      if (pool <= 0) break;
      const used = Math.min(pool, bill.remaining);
      bill.remaining -= used;
      pool -= used;
    }

    const oldest = bills.find((b) => b.remaining > 0.009);
    if (!oldest) continue;

    const [y, m, d] = oldest.date.split('-').map(Number);
    if (!y || !m || !d) continue;
    const start = new Date(y, m - 1, d).getTime();
    const days = Math.max(0, Math.floor((now.getTime() - start) / 86400000));

    if (days < minDays) continue;

    const bucket = days >= 30 ? 'due30' : days >= 15 ? 'due15' : days >= 7 ? 'due7' : 'current';

    out.push({
      id: c.id,
      name: c.name,
      englishName: c.englishName ?? null,
      teluguName: c.teluguName ?? null,
      hindiName: c.hindiName ?? null,
      phone: c.phone ?? null,
      due: c.due,
      oldestDays: days,
      bucket,
      oldestDate: oldest.date,
    });
  }

  return out.sort((a, b) => b.oldestDays - a.oldestDays);
}

// =====================
// Admin CRUD functions
// =====================

// ---- Shop management ----

export async function updateShop(shopId: string, data: { name?: string; address?: string; phone?: string; active?: boolean; billing_status?: string }): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  if (data.name !== undefined) await sql`UPDATE shops SET name = ${data.name} WHERE id = ${shopId}`;
  if (data.address !== undefined) await sql`UPDATE shops SET address = ${data.address || null} WHERE id = ${shopId}`;
  if (data.phone !== undefined) await sql`UPDATE shops SET phone = ${data.phone || null} WHERE id = ${shopId}`;
  if (data.active !== undefined) await sql`UPDATE shops SET active = ${data.active} WHERE id = ${shopId}`;
  if (data.billing_status !== undefined) await sql`UPDATE shops SET billing_status = ${data.billing_status} WHERE id = ${shopId}`;
}

export async function deleteShop(shopId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  // Delete all related data in order (child tables first)
  await sql`DELETE FROM bill_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM purchase_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM transactions WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM purchases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM supplier_payments WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM suppliers WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM wastage WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM catalog_aliases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM catalog_items WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM customer_aliases WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM rate_history WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM expenses WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM customers WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM shop_users WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM subscription_payments WHERE shop_id = ${shopId}`;
  await sql`DELETE FROM shops WHERE id = ${shopId}`;
}

// ---- Customer management ----

export async function adminUpdateCustomer(customerId: string, shopId: string, data: { name?: string; phone?: string; englishName?: string; teluguName?: string; hindiName?: string; creditLimit?: number | null }): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  if (data.name !== undefined) await sql`UPDATE customers SET name = ${data.name} WHERE id = ${customerId} AND shop_id = ${shopId}`;
  if (data.phone !== undefined) await sql`UPDATE customers SET phone = ${data.phone || null} WHERE id = ${customerId} AND shop_id = ${shopId}`;
  if (data.englishName !== undefined) await sql`UPDATE customers SET english_name = ${data.englishName || null} WHERE id = ${customerId} AND shop_id = ${shopId}`;
  if (data.teluguName !== undefined) await sql`UPDATE customers SET telugu_name = ${data.teluguName || null} WHERE id = ${customerId} AND shop_id = ${shopId}`;
  if (data.hindiName !== undefined) await sql`UPDATE customers SET hindi_name = ${data.hindiName || null} WHERE id = ${customerId} AND shop_id = ${shopId}`;
  if (data.creditLimit !== undefined) await sql`UPDATE customers SET credit_limit = ${data.creditLimit} WHERE id = ${customerId} AND shop_id = ${shopId}`;
}

export async function adminDeleteCustomer(customerId: string, shopId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  // Delete bill_items for this customer's transactions
  const txns = await sql`SELECT id FROM transactions WHERE customer_id = ${customerId} AND shop_id = ${shopId}`;
  for (const t of txns) {
    await sql`DELETE FROM bill_items WHERE transaction_id = ${t.id}`;
  }
  await sql`DELETE FROM transactions WHERE customer_id = ${customerId} AND shop_id = ${shopId}`;
  await sql`DELETE FROM customers WHERE id = ${customerId} AND shop_id = ${shopId}`;
}

// ---- Transaction management ----

export async function adminUpdateTransaction(txnId: string, shopId: string, data: { date?: string; bill_no?: string | null; bill_amount?: number; amount_paid?: number; notes?: string | null; payment_method?: string }): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  if (data.date !== undefined) await sql`UPDATE transactions SET date = ${data.date} WHERE id = ${txnId} AND shop_id = ${shopId}`;
  if (data.bill_no !== undefined) await sql`UPDATE transactions SET bill_no = ${data.bill_no || null} WHERE id = ${txnId} AND shop_id = ${shopId}`;
  if (data.bill_amount !== undefined) await sql`UPDATE transactions SET bill_amount = ${data.bill_amount} WHERE id = ${txnId} AND shop_id = ${shopId}`;
  if (data.amount_paid !== undefined) await sql`UPDATE transactions SET amount_paid = ${data.amount_paid} WHERE id = ${txnId} AND shop_id = ${shopId}`;
  if (data.notes !== undefined) await sql`UPDATE transactions SET notes = ${data.notes || null} WHERE id = ${txnId} AND shop_id = ${shopId}`;
  if (data.payment_method !== undefined) await sql`UPDATE transactions SET payment_method = ${data.payment_method} WHERE id = ${txnId} AND shop_id = ${shopId}`;
}

export async function adminDeleteTransaction(txnId: string, shopId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM bill_items WHERE transaction_id = ${txnId} AND shop_id = ${shopId}`;
  await sql`DELETE FROM transactions WHERE id = ${txnId} AND shop_id = ${shopId}`;
}

// ---- Purchase management ----

export async function adminDeletePurchase(purchaseId: string, shopId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId} AND shop_id = ${shopId}`;
  await sql`DELETE FROM purchases WHERE id = ${purchaseId} AND shop_id = ${shopId}`;
}

// ---- Supplier management ----

export async function adminDeleteSupplier(supplierId: string, shopId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM supplier_payments WHERE supplier_id = ${supplierId} AND shop_id = ${shopId}`;
  // Null out supplier_id on purchases (keep purchase records)
  await sql`UPDATE purchases SET supplier_id = null, supplier = null WHERE supplier_id = ${supplierId} AND shop_id = ${shopId}`;
  await sql`DELETE FROM suppliers WHERE id = ${supplierId} AND shop_id = ${shopId}`;
}

// ---- Catalog item management ----

export async function adminDeleteCatalogItem(itemId: string, shopId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM catalog_aliases WHERE item_id = ${itemId} AND shop_id = ${shopId}`;
  await sql`DELETE FROM catalog_items WHERE id = ${itemId} AND shop_id = ${shopId}`;
}

export async function adminUpdateCatalogItem(itemId: string, shopId: string, data: { name?: string; default_sell_price?: number | null; telugu_name?: string | null; hindi_name?: string | null; active?: boolean }): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  if (data.name !== undefined) await sql`UPDATE catalog_items SET name = ${data.name} WHERE id = ${itemId} AND shop_id = ${shopId}`;
  if (data.default_sell_price !== undefined) await sql`UPDATE catalog_items SET default_sell_price = ${data.default_sell_price || null} WHERE id = ${itemId} AND shop_id = ${shopId}`;
  if (data.telugu_name !== undefined) await sql`UPDATE catalog_items SET telugu_name = ${data.telugu_name || null} WHERE id = ${itemId} AND shop_id = ${shopId}`;
  if (data.hindi_name !== undefined) await sql`UPDATE catalog_items SET hindi_name = ${data.hindi_name || null} WHERE id = ${itemId} AND shop_id = ${shopId}`;
  if (data.active !== undefined) await sql`UPDATE catalog_items SET active = ${data.active} WHERE id = ${itemId} AND shop_id = ${shopId}`;
}
