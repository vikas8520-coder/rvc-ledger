import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { Customer, BillData, BillItem, TxnView } from './types';
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
  schemaReady = true;
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
