import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { Customer, BillData, BillItem, TxnView, PurchaseData, PurchaseView, Supplier, WastageEntry, CatalogItem, StockLevel } from './types';
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

export async function getCustomerNames(): Promise<string[]> {
  if (!isDbConfigured()) {
    return (seed as unknown as Customer[]).map((c) => c.name);
  }
  const sql = getSql();
  const rows = await sql`SELECT name FROM customers ORDER BY name`;
  return rows.map((r) => r.name as string);
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

export async function getCustomers(): Promise<Customer[]> {
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

  const customers = await sql`SELECT id, name, phone FROM customers ORDER BY name`;
  const txns = await sql`SELECT * FROM transactions ORDER BY date, created_at`;
  const items = await sql`SELECT * FROM bill_items`;

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
      phone: (c.phone as string | null) ?? null,
      billed,
      paid,
      due: billed - paid,
      txns: txnViews,
    });
  }

  return customersOut;
}

export async function saveBill(bill: BillData): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  // Upsert customer and insert transaction + items in one atomic batch
  const [customer] = await sql`
    INSERT INTO customers (name)
    VALUES (${bill.customerName})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  if (!customer) throw new Error('Could not upsert customer');

  const notes = bill.market ? encodeMarketNotes(bill.market) : null;

  const [transaction] = await sql`
    INSERT INTO transactions (customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path)
    VALUES (${customer.id}, ${bill.date}, ${bill.billNo}, ${bill.total}, 0, ${notes}, ${bill.imagePath || null})
    RETURNING id
  `;

  if (!transaction) throw new Error('Could not insert transaction');

  for (const it of bill.items) {
    const inferred = inferItemKind(it);
    await sql`
      INSERT INTO bill_items (transaction_id, raw_text, confirmed_name, qty, rate, amount, display, kind, charge_code)
      VALUES (${transaction.id}, ${it.raw_text}, ${it.confirmed_name}, ${it.qty}, ${it.rate}, ${it.amount}, ${it.display}, ${inferred.kind}, ${inferred.chargeCode})
    `;
  }
}

export async function recordPayment(customerName: string, date: string, amount: number, notes: string): Promise<void> {
  const sql = getSql();

  const [customer] = await sql`
    INSERT INTO customers (name)
    VALUES (${customerName})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  if (!customer) throw new Error('Could not upsert customer');

  await sql`
    INSERT INTO transactions (customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path)
    VALUES (${customer.id}, ${date}, NULL, 0, ${amount}, ${notes || 'Payment received'}, NULL)
  `;
}

export async function getPurchases(): Promise<PurchaseView[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`SELECT * FROM purchases ORDER BY date DESC, created_at DESC`;
  const items = await sql`SELECT * FROM purchase_items`;

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

export async function savePurchase(purchase: PurchaseData): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  let supplierId: string | null = null;
  if (purchase.supplier?.trim()) {
    const [sup] = await sql`
      INSERT INTO suppliers (name)
      VALUES (${purchase.supplier.trim()})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    supplierId = sup?.id as string;
  }

  const notes = purchase.market ? encodeMarketNotes(purchase.market) : null;
  const [row] = await sql`
    INSERT INTO purchases (date, supplier, bill_no, total, notes, supplier_id)
    VALUES (${purchase.date}, ${purchase.supplier || null}, ${purchase.billNo || null}, ${purchase.total}, ${notes}, ${supplierId})
    RETURNING id
  `;
  if (!row) throw new Error('Could not insert purchase');

  for (const it of purchase.items) {
    const hit = it.kind ? null : detectCharge(it.name || '');
    const kind = it.kind || (hit ? 'charge' : 'item');
    const code = it.chargeCode ?? (hit ? hit.code : null);
    await sql`
      INSERT INTO purchase_items (purchase_id, name, qty, rate, amount, kind, charge_code)
      VALUES (${row.id}, ${it.name}, ${it.qty}, ${it.rate}, ${it.amount}, ${kind}, ${code})
    `;
  }
}

export async function deletePurchase(id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM purchase_items WHERE purchase_id = ${id}`;
  await sql`DELETE FROM purchases WHERE id = ${id}`;
}

export async function setCustomerPhone(id: string, phone: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE customers SET phone = ${phone || null} WHERE id = ${id}`;
}

export async function deleteTransaction(id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM bill_items WHERE transaction_id = ${id}`;
  await sql`DELETE FROM transactions WHERE id = ${id}`;
}

export async function getSuppliers(): Promise<Supplier[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  const suppliers = await sql`SELECT id, name, phone FROM suppliers ORDER BY name`;
  const purchases = await sql`SELECT id, supplier_id, date, bill_no, total FROM purchases WHERE supplier_id IS NOT NULL ORDER BY date, created_at`;
  const payments = await sql`SELECT * FROM supplier_payments ORDER BY date, created_at`;
  const items = await sql`SELECT * FROM purchase_items`;

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

export async function recordSupplierPayment(supplierName: string, date: string, amount: number, notes: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  const [sup] = await sql`
    INSERT INTO suppliers (name)
    VALUES (${supplierName.trim()})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  if (!sup) throw new Error('Could not upsert supplier');

  await sql`
    INSERT INTO supplier_payments (supplier_id, date, amount, notes)
    VALUES (${sup.id}, ${date}, ${amount}, ${notes || null})
  `;
}

export async function setSupplierPhone(id: string, phone: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE suppliers SET phone = ${phone || null} WHERE id = ${id}`;
}

export async function getWastage(): Promise<WastageEntry[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM wastage ORDER BY date DESC, created_at DESC`;
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

export async function saveWastage(entry: Omit<WastageEntry, 'id'>): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO wastage (date, item_name, qty, unit, reason, est_cost)
    VALUES (${entry.date}, ${entry.itemName}, ${entry.qty || null}, ${entry.unit || null}, ${entry.reason || null}, ${entry.estCost})
  `;
}

export async function deleteWastage(id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM wastage WHERE id = ${id}`;
}

/* ---- Item catalog ---- */

export async function getCatalog(): Promise<CatalogItem[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();
  const items = await sql`SELECT * FROM catalog_items ORDER BY name`;
  const aliases = await sql`SELECT * FROM catalog_aliases`;

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

export async function saveCatalogItem(item: Omit<CatalogItem, 'id'> & { id?: string }): Promise<void> {
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
      WHERE id = ${item.id}
    `;
    await sql`DELETE FROM catalog_aliases WHERE item_id = ${item.id}`;
    for (const alias of item.aliases) {
      await sql`INSERT INTO catalog_aliases (item_id, alias) VALUES (${item.id}, ${alias})`;
    }
  } else {
    const [row] = await sql`
      INSERT INTO catalog_items (name, default_unit, default_sell_price, telugu_name, hindi_name, active)
      VALUES (${item.name}, ${item.defaultUnit || null}, ${item.defaultSellPrice || null}, ${item.teluguName || null}, ${item.hindiName || null}, ${item.active})
      RETURNING id
    `;
    if (!row) throw new Error('Could not insert catalog item');
    for (const alias of item.aliases) {
      await sql`INSERT INTO catalog_aliases (item_id, alias) VALUES (${row.id}, ${alias})`;
    }
  }
}

export async function deleteCatalogItem(id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM catalog_aliases WHERE item_id = ${id}`;
  await sql`DELETE FROM catalog_items WHERE id = ${id}`;
}

/* ---- Stock levels ---- */

export async function getStock(): Promise<StockLevel[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const sql = getSql();

  // Aggregate purchased quantities from purchase_items
  const purchases = await sql`
    SELECT pi.name, pi.qty, pi.rate, p.date
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE pi.kind = 'item' OR pi.kind IS NULL
    ORDER BY p.date DESC
  `;

  // Aggregate sold quantities from bill_items
  const sales = await sql`
    SELECT bi.confirmed_name as name, bi.qty, t.date
    FROM bill_items bi
    JOIN transactions t ON bi.transaction_id = t.id
    WHERE bi.kind = 'item' OR bi.kind IS NULL
  `;

  // Aggregate wastage
  const wastage = await sql`SELECT item_name as name, qty, unit FROM wastage`;

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
