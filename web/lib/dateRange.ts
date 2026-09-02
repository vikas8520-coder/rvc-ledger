import type { Customer, TxnView } from './types';

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function currentFyStartYear(): number {
  const d = new Date();
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyStartISO(year = currentFyStartYear()): string {
  return `${year}-04-01`;
}

export function fyEndISO(year = currentFyStartYear()): string {
  return `${year + 1}-03-31`;
}

export function inDateRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function rangeLabel(from: string, to: string): string {
  if (!from && !to) return 'All';
  if (from && to && from === to) return from;
  if (from && to) return `${from} → ${to}`;
  if (from) return `from ${from}`;
  return `until ${to}`;
}

export function sliceCustomer(c: Customer, from: string, to: string): Customer {
  const opening = from
    ? c.txns
        .filter((tx) => tx.date < from)
        .reduce((bal, tx) => bal + (tx.type === 'bill' ? tx.amount : -tx.amount), 0)
    : 0;
  const txns: TxnView[] = c.txns.filter((tx) => inDateRange(tx.date, from, to));
  const billed = txns.filter((tx) => tx.type === 'bill').reduce((s, tx) => s + tx.amount, 0);
  const paid = txns.filter((tx) => tx.type === 'payment').reduce((s, tx) => s + tx.amount, 0);
  return { ...c, txns, billed, paid, due: opening + billed - paid };
}
