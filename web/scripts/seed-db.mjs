import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);

const base = '/Users/vikasreddy/Projects/bill-watcher';

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf-8');
  return parse(text, { columns: true, skip_empty_lines: true });
}

const txns = readCsv(path.join(base, 'transactions.csv'));
const items = readCsv(path.join(base, 'bill_items.csv'));

for (const t of txns) {
  const [customer] = await sql`
    INSERT INTO customers (name)
    VALUES (${t['Customer Name']})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  const [transaction] = await sql`
    INSERT INTO transactions (customer_id, date, bill_no, bill_amount, amount_paid, notes, image_path)
    VALUES (
      ${customer.id},
      ${t.Date},
      ${t['Bill No.'] || null},
      ${t['Bill Amount'] || 0},
      ${t['Amount Paid Today'] || 0},
      ${t.Notes || null},
      null
    )
    RETURNING id
  `;

  const txnItems = items.filter(
    (it) => it.Date === t.Date && it['Customer Name'] === t['Customer Name'] && (it['Bill No.'] || '') === (t['Bill No.'] || '')
  );

  for (const it of txnItems) {
    const display = it.display || it.Amount;
    await sql`
      INSERT INTO bill_items (transaction_id, raw_text, confirmed_name, qty, rate, amount, display)
      VALUES (
        ${transaction.id},
        ${it.raw_text || it.confirmed_name},
        ${it.confirmed_name},
        ${it.qty || null},
        ${it.rate || null},
        ${it.Amount || 0},
        ${display}
      )
    `;
  }
}

console.log('Seed complete');
