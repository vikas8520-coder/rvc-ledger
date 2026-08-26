import { Customer, TxnView } from './types';
import { fmt, fmtDate } from './format';

export interface AgingInfo {
  /** Days since the oldest still-unpaid bill. 0 when nothing is outstanding. */
  oldestDays: number;
  /** Bucket for quick sorting/labels. */
  bucket: 'clear' | 'current' | 'due7' | 'due15' | 'due30';
  /** Date of the oldest unpaid bill, if any. */
  oldestDate: string | null;
}

function daysBetween(from: string, to: Date): number {
  const [y, m, d] = from.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const start = new Date(y, m - 1, d).getTime();
  const diff = to.getTime() - start;
  return Math.max(0, Math.floor(diff / 86400000));
}

/**
 * Applies payments to bills oldest-first (how a khata is actually settled),
 * then reports how old the earliest still-unpaid bill is.
 */
export function computeAging(txns: TxnView[], now = new Date()): AgingInfo {
  const bills = txns
    .filter((t) => t.type === 'bill')
    .map((t) => ({ date: t.date, remaining: t.amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let pool = txns.filter((t) => t.type === 'payment').reduce((s, t) => s + t.amount, 0);

  for (const bill of bills) {
    if (pool <= 0) break;
    const used = Math.min(pool, bill.remaining);
    bill.remaining -= used;
    pool -= used;
  }

  const oldest = bills.find((b) => b.remaining > 0.009);
  if (!oldest) return { oldestDays: 0, bucket: 'clear', oldestDate: null };

  const days = daysBetween(oldest.date, now);
  const bucket = days >= 30 ? 'due30' : days >= 15 ? 'due15' : days >= 7 ? 'due7' : 'current';
  return { oldestDays: days, bucket, oldestDate: oldest.date };
}

export function agingLabel(info: AgingInfo): string {
  if (info.bucket === 'clear') return '';
  if (info.oldestDays === 0) return 'today';
  return `${info.oldestDays}d`;
}

export function agingColor(info: AgingInfo): string {
  switch (info.bucket) {
    case 'due30':
      return 'bg-[#8b2e2e] text-white';
    case 'due15':
      return 'bg-[#c4622d] text-white';
    case 'due7':
      return 'bg-[#c9a227] text-[#3a2f2f]';
    default:
      return 'bg-[#d9d0c2] text-[#5a4a3a]';
  }
}

/** Plain-text statement, safe to paste into WhatsApp or SMS. */
export function statementText(customer: Customer, shopName = 'RVC'): string {
  const lines: string[] = [];
  lines.push(`${shopName} — ${customer.name}`);
  lines.push('');

  for (const txn of customer.txns) {
    const label =
      txn.type === 'payment'
        ? 'Payment'
        : txn.billNo
          ? `Bill ${txn.billNo}`
          : 'Bill';
    const sign = txn.type === 'payment' ? '-' : '+';
    lines.push(`${fmtDate(txn.date)}  ${label}  ${sign}${fmt(txn.amount)}`);
  }

  lines.push('');
  lines.push(`Billed: ${fmt(customer.billed)}`);
  lines.push(`Paid: ${fmt(customer.paid)}`);
  lines.push(`Due: ${fmt(customer.due)}`);
  return lines.join('\n');
}

/** Short reminder message focused on the outstanding amount. */
export function reminderText(customer: Customer, shopName = 'RVC'): string {
  const aging = computeAging(customer.txns);
  const parts = [
    `Namaste ${customer.name},`,
    '',
    `Pending amount at ${shopName}: ${fmt(customer.due)}.`,
  ];
  if (aging.oldestDate) {
    parts.push(`Oldest unpaid bill: ${fmtDate(aging.oldestDate, true)} (${aging.oldestDays} days).`);
  }
  parts.push('', 'Please arrange the payment. Thank you.');
  return parts.join('\n');
}

export function waLink(message: string, phone?: string | null): string {
  const text = encodeURIComponent(message);
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const withCode = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${withCode}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function customerCsv(customer: Customer): string {
  const rows: string[][] = [
    ['Date', 'Type', 'Bill No', 'Item', 'Qty', 'Rate', 'Amount', 'Txn total', 'Balance after'],
  ];

  for (const txn of customer.txns) {
    if (txn.type === 'bill' && txn.items.length > 0) {
      txn.items.forEach((it, i) => {
        rows.push([
          txn.date,
          i === 0 ? 'Bill' : '',
          i === 0 ? txn.billNo || '' : '',
          it.name,
          it.qty || '',
          it.rate || '',
          String(it.amount),
          i === 0 ? String(txn.amount) : '',
          i === 0 ? String(txn.balanceAfter) : '',
        ]);
      });
    } else {
      rows.push([
        txn.date,
        txn.type === 'payment' ? 'Payment' : 'Bill',
        txn.billNo || '',
        '',
        '',
        '',
        '',
        String(txn.amount),
        String(txn.balanceAfter),
      ]);
    }
  }

  rows.push([]);
  rows.push(['Billed', String(customer.billed)]);
  rows.push(['Paid', String(customer.paid)]);
  rows.push(['Due', String(customer.due)]);

  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function customersCsv(customers: Customer[]): string {
  const rows: string[][] = [['Customer', 'Phone', 'Billed', 'Paid', 'Due', 'Oldest unpaid days']];
  for (const c of customers) {
    const aging = computeAging(c.txns);
    rows.push([
      c.name,
      c.phone || '',
      String(c.billed),
      String(c.paid),
      String(c.due),
      aging.bucket === 'clear' ? '' : String(aging.oldestDays),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
