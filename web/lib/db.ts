import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { Customer, BillData, BillItem, TxnView } from './types';
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

export async function getCustomerNames(): Promise<string[]> {
  if (!isDbConfigured()) {
    return (seed as unknown as Customer[]).map((c) => c.name);
  }
  const sql = getSql();
  const rows = await sql`SELECT name FROM customers ORDER BY name`;
  return rows.map((r) => r.name as string);
}

export async function getCustomers(): Promise<Customer[]> {
  if (!isDbConfigured()) {
    return (seed as unknown as Customer[]).map((c) => ({ ...c, id: c.id || `seed-${c.name}` }));
  }

  const sql = getSql();

  const customers = await sql`SELECT id, name FROM customers ORDER BY name`;
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
        return [it.confirmed_name, detail] as [string, string];
      });

      return {
        id: t.id,
        title,
        type,
        amount,
        balanceAfter: balance,
        date: toDateStr(t.date),
        items: txnItems,
      };
    });

    const billed = customerTxns.reduce((s: number, t: any) => s + Number(t.bill_amount), 0);
    const paid = customerTxns.reduce((s: number, t: any) => s + Number(t.amount_paid), 0);

    customersOut.push({
      id: c.id as string,
      name: c.name as string,
      billed,
      paid,
      due: billed - paid,
      txns: txnViews,
    });
  }

  return customersOut;
}

export async function saveBill(bill: BillData): Promise<void> {
  const sql = getSql();

  // Upsert customer and insert transaction + items in one atomic batch
  const [customer] = await sql`
    INSERT INTO customers (name)
    VALUES (${bill.customerName})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  if (!customer) throw new Error('Could not upsert customer');

  const [transaction] = await sql`
    INSERT INTO transactions (customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path)
    VALUES (${customer.id}, ${bill.date}, ${bill.billNo}, ${bill.total}, 0, NULL, ${bill.imagePath || null})
    RETURNING id
  `;

  if (!transaction) throw new Error('Could not insert transaction');

  for (const it of bill.items) {
    await sql`
      INSERT INTO bill_items (transaction_id, raw_text, confirmed_name, qty, rate, amount, display)
      VALUES (${transaction.id}, ${it.raw_text}, ${it.confirmed_name}, ${it.qty}, ${it.rate}, ${it.amount}, ${it.display})
    `;
  }
}
