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
      name TEXT UNIQUE NOT NULL,
      default_unit TEXT,
      default_sell_price NUMERIC(12,2),
      telugu_name TEXT,
      hindi_name TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
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
  await sql`
    CREATE TABLE IF NOT EXISTS shop_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id TEXT UNIQUE NOT NULL,
      shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner',
      name TEXT,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE wastage ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE catalog_aliases ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS shop_id UUID`;
  await sql`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS shop_id UUID`;

  schemaReady = true;
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
    await sql`UPDATE shop_users SET shop_id = ${shopId}, role = 'owner', name = ${name || null}, email = ${email || null} WHERE clerk_user_id = ${clerkUserId}`;
    return shopId;
  }

  await sql`
    INSERT INTO shop_users (clerk_user_id, shop_id, role, name, email)
    VALUES (${clerkUserId}, ${shopId}, 'owner', ${name || null}, ${email || null})
  `;
  return shopId;
}

export async function getOrCreateShop(
  clerkUserId: string,
  email: string,
  name: string,
): Promise<{ shopId: string | null; role: string }> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT shop_id, role FROM shop_users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
  `;
  if (rows.length > 0) {
    const r = rows[0] as any;
    return { shopId: (r.shop_id as string) ?? null, role: (r.role as string) ?? 'owner' };
  }
  return { shopId: null, role: 'owner' };
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
    INSERT INTO shop_users (clerk_user_id, shop_id, role, name, email)
    VALUES (${clerkUserId}, ${shopId}, 'owner', ${name || null}, ${email || null})
  `;
  return shopId;
}

export async function getAllShops(): Promise<any[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM shops ORDER BY created_at DESC`;
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

export async function getCustomers(shopId: string): Promise<Customer[]> {
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

  const customers = await sql`SELECT id, name, english_name, telugu_name, hindi_name, phone, credit_limit FROM customers WHERE shop_id = ${shopId} ORDER BY name`;
  const txns = await sql`SELECT * FROM transactions WHERE shop_id = ${shopId} ORDER BY date, created_at`;
  const items = await sql`SELECT * FROM bill_items WHERE shop_id = ${shopId}`;

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

  const customersOut: Customer[] = [];
  for (const c of customers) {
    const customerTxns = (txns as any[]).filter((t) => t.customer_id === c.id);
    let balance = 0;
    const txnViews: TxnView[] = customerTxns.map((t) => {
      const amount = Number(t.amount_paid > 0 ? t.amount_paid : t.bill_amount);
      const type: 'bill' | 'payment' = Number(t.amount_paid) > 0 ? 'payment' : 'bill';
      const title =
        Number(t.amount_paid) > 0
          ? 'Payment received'
          : t.bill_no
            ? `Bill No. ${t.bill_no}`
            : 'Bill';
      balance += type === 'bill' ? Number(t.bill_amount) : -Number(t.amount_paid);

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
        };
      });

      return {
        id: t.id,
        title,
        type,
        amount,
        balanceAfter: balance,
        date: toDateStr(t.date),
        billNo: t.bill_no,
        items: txnItems,
        market: decodeMarketNotes(t.notes),
      };
    });

    const billed = customerTxns.reduce((s: number, t: any) => s + Number(t.bill_amount), 0);
    const paid = customerTxns.reduce((s: number, t: any) => s + Number(t.amount_paid), 0);

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
      due: billed - paid,
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

  const [transaction] = await sql`
    INSERT INTO transactions (customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path, shop_id)
    VALUES (${customer.id}, ${bill.date}, ${bill.billNo}, ${bill.total}, 0, ${notes}, ${bill.imagePath || null}, ${shopId})
    RETURNING id
  `;

  if (!transaction) throw new Error('Could not insert transaction');

  for (const it of bill.items) {
    const inferred = inferItemKind(it);
    await sql`
      INSERT INTO bill_items (transaction_id, raw_text, confirmed_name, qty, rate, amount, display, kind, charge_code, shop_id)
      VALUES (${transaction.id}, ${it.raw_text}, ${it.confirmed_name}, ${it.qty}, ${it.rate}, ${it.amount}, ${it.display}, ${inferred.kind}, ${inferred.chargeCode}, ${shopId})
    `;
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

/* ---- Suppliers ---- */

export async function getSuppliers(shopId: string): Promise<Supplier[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  const suppliers = await sql`SELECT id, name, phone FROM suppliers WHERE shop_id = ${shopId} ORDER BY name`;
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

export async function getCatalog(shopId: string): Promise<CatalogItem[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
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
      RETURNING id
    `;
    if (!row) return;
    itemId = (row as any).id;
  }

  // Check if alias already exists
  const dup = await sql`SELECT id FROM catalog_aliases WHERE item_id = ${itemId} AND alias = ${cleanAlias} AND shop_id = ${shopId} LIMIT 1`;
  if (dup.length > 0) return;

  await sql`INSERT INTO catalog_aliases (item_id, alias, shop_id) VALUES (${itemId}, ${cleanAlias}, ${shopId})`;
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
  const [customers, transactions, billItems, purchases, purchaseItems, suppliers, supplierPayments, wastage, catalogItems, catalogAliases, expenses] = await Promise.all([
    sql`SELECT id, name, phone, credit_limit FROM customers WHERE shop_id = ${shopId} ORDER BY name`,
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
