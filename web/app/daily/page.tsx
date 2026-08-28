'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { DailySummary, StockLevel, Customer } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DailyOpsPage() {
  const { t } = useI18n();
  const [date, setDate] = useState(today());
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/daily-summary?date=${date}`).then((r) => r.json()),
      fetch('/api/stock').then((r) => r.json()),
      fetch('/api/dashboard').then((r) => r.json()),
    ])
      .then(([s, stk, dash]) => {
        setSummary(s);
        setStock(stk.stock || []);
        setCustomers(dash.customers || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;

  const totalDue = customers.reduce((s, c) => s + c.due, 0);
  const todayBills = customers.flatMap((c) =>
    c.txns.filter((tx) => tx.type === 'bill' && tx.date === date).map((tx) => ({ ...tx, customerName: c.name, customerId: c.id }))
  );
  const todayPayments = customers.flatMap((c) =>
    c.txns.filter((tx) => tx.type === 'payment' && tx.date === date).map((tx) => ({ ...tx, customerName: c.name, customerId: c.id }))
  );

  const lowStock = stock.filter((s) => s.qty > 0 && s.qty < 5);
  const outStock = stock.filter((s) => s.qty <= 0);
  const stockValue = stock.reduce((s, st) => s + (st.lastRate || 0) * st.qty, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t('dailyOps')}</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm"
        />
      </div>

      {/* P&L Summary */}
      {summary && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t('purchasedToday')} value={fmt(summary.purchased)} sub={`${summary.purchaseCount} ${t('entries')}`} />
          <Stat label={t('soldToday')} value={fmt(summary.sold)} sub={`${summary.saleCount} ${t('bills')}`} />
          <Stat label={t('collectedToday')} value={fmt(summary.collected)} accent="green" />
          <Stat label={t('estProfit')} value={fmt(summary.estProfit)} accent={summary.estProfit >= 0 ? 'green' : 'red'} />
        </section>
      )}

      {/* Cash position */}
      {summary && (
        <section className="rounded-lg bg-[var(--bg-card)] p-3">
          <h2 className="mb-2 text-sm font-semibold">{t('cashPosition')}</h2>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('collected')}</p>
              <p className="font-semibold text-[var(--bg-success)]">{fmt(summary.collected)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('supplierPaid')}</p>
              <p className="font-semibold text-[var(--bg-primary)]">{fmt(summary.supplierPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('navExpenses')}</p>
              <p className="font-semibold">{fmt(summary.expenses)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('netCash')}</p>
              <p className={`font-bold ${summary.netCash >= 0 ? 'text-[var(--bg-success)]' : 'text-[var(--bg-primary)]'}`}>
                {fmt(summary.netCash)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Outstanding credit + stock value */}
      <section className="grid grid-cols-2 gap-2">
        <Stat label={t('totalOutstanding')} value={fmt(totalDue)} accent="red" />
        <Stat label={t('stockValue')} value={fmt(stockValue)} />
      </section>

      {/* Today's sales */}
      <section className="rounded-lg bg-[var(--bg-card)] p-3">
        <h2 className="mb-2 text-sm font-semibold">{t('todaySales')} ({todayBills.length})</h2>
        {todayBills.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">{t('noSalesToday')}</p>
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {todayBills.map((tx) => (
              <li key={tx.id}>
                <Link href={`/customers/${tx.customerId}`} className="flex items-center justify-between gap-2 py-2 hover:opacity-80">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{tx.customerName}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{tx.billNo || 'Bill'}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{fmt(tx.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Today's collections */}
      <section className="rounded-lg bg-[var(--bg-card)] p-3">
        <h2 className="mb-2 text-sm font-semibold">{t('todayCollections')} ({todayPayments.length})</h2>
        {todayPayments.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">{t('noCollectionsToday')}</p>
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {todayPayments.map((tx) => (
              <li key={tx.id}>
                <Link href={`/customers/${tx.customerId}`} className="flex items-center justify-between gap-2 py-2 hover:opacity-80">
                  <span className="truncate text-sm font-medium">{tx.customerName}</span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--bg-success)]">{fmt(tx.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stock alerts */}
      {(lowStock.length > 0 || outStock.length > 0) && (
        <section className="rounded-lg bg-[var(--bg-card)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('stockAlerts')}</h2>
            <Link href="/stock" className="text-xs text-[var(--bg-primary)] hover:underline">{t('navStock')} →</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {outStock.map((s) => (
              <span key={s.itemKey} className="rounded-md bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-on-primary)]">
                {s.itemName} — {t('outOfStock')}
              </span>
            ))}
            {lowStock.map((s) => (
              <span key={s.itemKey} className="rounded-md bg-[var(--bg-warning)] px-2 py-1 text-xs text-[var(--text-primary)]">
                {s.itemName} — {s.qty} {s.unit || ''} {t('lowStock')}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Wastage */}
      {summary && summary.wastageCost > 0 && (
        <section className="rounded-lg bg-[var(--bg-warning)] bg-opacity-20 p-3">
          <p className="text-sm">
            <span className="font-semibold">{t('navWastage')}:</span> {fmt(summary.wastageCost)}
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  const colorClass = accent === 'green' ? 'text-[var(--bg-success)]' : accent === 'red' ? 'text-[var(--bg-primary)]' : '';
  return (
    <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={`text-lg font-bold sm:text-xl ${colorClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-faint)]">{sub}</p>}
    </div>
  );
}
