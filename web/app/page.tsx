'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from './components/I18nProvider';
import { useDashboard } from './components/useDashboard';
import TxnCard from './components/TxnCard';
import AgingBadge from './components/AgingBadge';
import { fmt, thisMonthKey } from '@/lib/format';
import { computeAging } from '@/lib/statement';
import { StockLevel } from '@/lib/types';

export default function Home() {
  const { t } = useI18n();
  const { customers, configured, loading } = useDashboard();
  const [stock, setStock] = useState<StockLevel[]>([]);

  useEffect(() => {
    fetch('/api/stock')
      .then((r) => r.json())
      .then((d) => setStock(d.stock || []))
      .catch(() => setStock([]));
  }, []);

  const totalBilled = customers.reduce((s, c) => s + c.billed, 0);
  const totalPaid = customers.reduce((s, c) => s + c.paid, 0);
  const totalDue = customers.reduce((s, c) => s + c.due, 0);
  const month = thisMonthKey();
  const today = new Date().toISOString().slice(0, 10);
  const monthBilled = customers.reduce(
    (s, c) => s + c.txns.filter((t) => t.type === 'bill' && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0),
    0
  );
  const monthPaid = customers.reduce(
    (s, c) => s + c.txns.filter((t) => t.type === 'payment' && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0),
    0
  );
  const todayBilled = customers.reduce(
    (s, c) => s + c.txns.filter((t) => t.type === 'bill' && t.date === today).reduce((a, t) => a + t.amount, 0),
    0
  );

  const lowStock = stock.filter((s) => s.qty > 0 && s.qty < 5);
  const outStock = stock.filter((s) => s.qty <= 0);

  const topDues = [...customers].sort((a, b) => b.due - a.due).slice(0, 6);
  const recent = customers
    .flatMap((c) => c.txns.map((txn) => ({ ...txn, customerName: c.name, customerId: c.id })))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 8);

  if (loading) {
    return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-[var(--text-faint)]">{configured ? t('liveFrom') : 'Preview from local CSV'}</p>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t('due')} value={fmt(totalDue)} accent />
        <Stat label={t('billed')} value={fmt(totalBilled)} />
        <Stat label={t('paid')} value={fmt(totalPaid)} />
        <Stat label={t('customersCount')} value={String(customers.length)} />
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label={`${t('thisMonth')} · ${t('billed')}`} value={fmt(monthBilled)} />
        <Stat label={`${t('thisMonth')} · ${t('paid')}`} value={fmt(monthPaid)} />
        <Stat label={t('bills')} value={String(customers.reduce((s, c) => s + c.txns.filter((t) => t.type === 'bill').length, 0))} />
      </section>

      {todayBilled > 0 && (
        <section className="rounded-lg bg-[var(--bg-success)] px-4 py-3 text-[var(--text-on-primary)]">
          <p className="text-xs opacity-80">{t('date')}: {today}</p>
          <p className="text-2xl font-bold">{fmt(todayBilled)}</p>
        </section>
      )}

      {(lowStock.length > 0 || outStock.length > 0) && (
        <section className="rounded-lg bg-[var(--bg-card)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('navStock')}</h2>
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

      {customers.length === 0 && (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">{t('noCustomers')}</p>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-[var(--bg-card)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('topDues')}</h2>
            <Link href="/customers" className="text-xs text-[var(--bg-primary)] hover:underline">
              {t('allCustomers')}
            </Link>
          </div>
          <ul className="divide-y divide-[var(--border-light)]">
            {topDues.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-2 py-2 hover:opacity-80">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    <AgingBadge aging={computeAging(c.txns)} />
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--bg-primary)]">{fmt(c.due)}</span>
                </Link>
              </li>
            ))}
            {topDues.length === 0 && <li className="py-3 text-sm text-[var(--text-faint)]">{t('noCustomers')}</li>}
          </ul>
        </div>

        <div className="rounded-lg bg-[var(--bg-card)] p-3">
          <h2 className="mb-2 text-sm font-semibold">{t('recentActivity')}</h2>
          {recent.length === 0 && <p className="text-sm text-[var(--text-faint)]">{t('noActivity')}</p>}
          <div className="space-y-2">
            {recent.map((txn) => (
              <div key={txn.id}>
                <Link href={`/customers/${txn.customerId}`} className="mb-1 block text-[11px] text-[var(--bg-primary)] hover:underline">
                  {txn.customerName}
                </Link>
                <TxnCard txn={txn} compact />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={`text-lg font-bold sm:text-xl ${accent ? 'text-[var(--bg-primary)]' : ''}`}>{value}</p>
    </div>
  );
}
