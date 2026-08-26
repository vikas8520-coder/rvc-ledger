import { Customer, PurchaseView } from './types';
import { itemKey, parseQty, parseRate, qtyBasis } from './units';

export interface MonthSummary {
  month: string;
  billed: number;
  collected: number;
  purchased: number;
}

export interface ItemStat {
  key: string;
  name: string;
  /** Sales */
  soldQty: number | null;
  soldUnit: string | null;
  revenue: number;
  avgSellRate: number | null;
  /** Purchases */
  boughtQty: number | null;
  boughtUnit: string | null;
  cost: number;
  avgBuyRate: number | null;
  lastBuyRate: number | null;
  lastBuyDate: string | null;
  /** Margin is only reported when both sides share a unit basis. */
  marginPerUnit: number | null;
  estMargin: number | null;
  comparable: boolean;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthlySummary(customers: Customer[], purchases: PurchaseView[]): MonthSummary[] {
  const map = new Map<string, MonthSummary>();

  const bump = (month: string): MonthSummary => {
    const existing = map.get(month);
    if (existing) return existing;
    const fresh = { month, billed: 0, collected: 0, purchased: 0 };
    map.set(month, fresh);
    return fresh;
  };

  for (const c of customers) {
    for (const txn of c.txns) {
      if (!txn.date) continue;
      const row = bump(monthOf(txn.date));
      if (txn.type === 'bill') row.billed += txn.amount;
      else row.collected += txn.amount;
    }
  }

  for (const p of purchases) {
    if (!p.date) continue;
    bump(monthOf(p.date)).purchased += p.total;
  }

  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}

interface Side {
  qty: number;
  unit: string | null;
  mixed: boolean;
  amount: number;
  lastRate: number | null;
  lastDate: string | null;
  name: string;
}

function blankSide(name: string): Side {
  return { qty: 0, unit: null, mixed: false, amount: 0, lastRate: null, lastDate: null, name };
}

function addToSide(
  side: Side,
  qtyText: string | null,
  rateText: string | null,
  amount: number,
  date: string
) {
  side.amount += amount;

  const basis = qtyBasis(parseQty(qtyText));
  if (basis) {
    if (side.unit && side.unit !== basis.unit) side.mixed = true;
    else side.unit = basis.unit;
    side.qty += basis.value;
  }

  const rate = parseRate(rateText);
  if (rate && (!side.lastDate || date >= side.lastDate)) {
    side.lastRate = rate.value;
    side.lastDate = date;
  }
}

export function itemStats(customers: Customer[], purchases: PurchaseView[]): ItemStat[] {
  const sales = new Map<string, Side>();
  const buys = new Map<string, Side>();

  for (const c of customers) {
    for (const txn of c.txns) {
      if (txn.type !== 'bill') continue;
      for (const it of txn.items) {
        if (it.kind === 'charge') continue;
        const key = itemKey(it.name);
        if (!key) continue;
        const side = sales.get(key) || blankSide(it.name);
        addToSide(side, it.qty, it.rate, it.amount, txn.date);
        sales.set(key, side);
      }
    }
  }

  for (const p of purchases) {
    for (const it of p.items) {
      if (it.kind === 'charge') continue;
      const key = itemKey(it.name);
      if (!key) continue;
      const side = buys.get(key) || blankSide(it.name);
      addToSide(side, it.qty, it.rate, it.amount, p.date);
      buys.set(key, side);
    }
  }

  const keys = new Set([...sales.keys(), ...buys.keys()]);
  const out: ItemStat[] = [];

  for (const key of keys) {
    const sell = sales.get(key);
    const buy = buys.get(key);

    const soldQty = sell && !sell.mixed && sell.qty > 0 ? sell.qty : null;
    const boughtQty = buy && !buy.mixed && buy.qty > 0 ? buy.qty : null;

    const avgSellRate = sell && soldQty && sell.amount > 0 ? sell.amount / soldQty : null;
    const avgBuyRate = buy && boughtQty && buy.amount > 0 ? buy.amount / boughtQty : null;

    const comparable =
      !!avgSellRate && !!avgBuyRate && !!sell?.unit && !!buy?.unit && sell.unit === buy.unit;

    const marginPerUnit = comparable ? avgSellRate! - avgBuyRate! : null;
    const estMargin = comparable && soldQty ? marginPerUnit! * soldQty : null;

    out.push({
      key,
      name: sell?.name || buy?.name || key,
      soldQty,
      soldUnit: sell?.unit ?? null,
      revenue: sell?.amount || 0,
      avgSellRate,
      boughtQty,
      boughtUnit: buy?.unit ?? null,
      cost: buy?.amount || 0,
      avgBuyRate,
      lastBuyRate: buy?.lastRate ?? null,
      lastBuyDate: buy?.lastDate ?? null,
      marginPerUnit,
      estMargin,
      comparable,
    });
  }

  return out.sort((a, b) => b.revenue - a.revenue);
}

/** Latest known buy rate per item, for pricing hints while billing. */
export function latestBuyRates(purchases: PurchaseView[]): Map<string, { rate: number; unit: string | null; date: string }> {
  const map = new Map<string, { rate: number; unit: string | null; date: string }>();
  for (const p of purchases) {
    for (const it of p.items) {
      if (it.kind === 'charge') continue;
      const rate = parseRate(it.rate);
      if (!rate) continue;
      const key = itemKey(it.name);
      const existing = map.get(key);
      if (!existing || p.date >= existing.date) {
        const basis = qtyBasis(parseQty(it.qty));
        map.set(key, { rate: rate.value, unit: rate.unit || basis?.unit || null, date: p.date });
      }
    }
  }
  return map;
}

export function topCustomers(customers: Customer[], limit = 5) {
  return [...customers]
    .map((c) => ({ name: c.name, id: c.id, billed: c.billed, due: c.due }))
    .sort((a, b) => b.billed - a.billed)
    .slice(0, limit);
}
