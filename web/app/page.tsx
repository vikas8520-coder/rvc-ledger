'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from './components/I18nProvider';
import { useDashboard } from './components/useDashboard';
import TxnCard from './components/TxnCard';
import AgingBadge from './components/AgingBadge';
import { Card, SectionHeader, StatCard, EmptyState, StatSkeleton, ListSkeleton, PageHeader } from './components/ui';
import { UsersIcon, DollarIcon, PackageIcon, CalendarIcon, TrendingIcon, CameraIcon } from './components/Icons';
import { fmt, thisMonthKey } from '@/lib/format';
import { computeAging } from '@/lib/statement';
import { StockLevel, DailySummary } from '@/lib/types';

export default function Home() {
  const { t } = useI18n();
  const { customers, configured, loading } = useDashboard();
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [stockLoading, setStockLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stock')
      .then((r) => r.json())
      .then((d) => setStock(d.stock || []))
      .catch(() => setStock([]))
      .finally(() => setStockLoading(false));
    fetch('/api/daily-summary')
      .then((r) => r.json())
      .then((d) => setDaily(d))
      .catch(() => setDaily(null));
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

  const lowStock = stock.filter((s) => s.qty > 0 && s.qty < 5);
  const outStock = stock.filter((s) => s.qty <= 0);

  const topDues = [...customers].sort((a, b) => b.due - a.due).slice(0, 6);
  const recent = customers
    .flatMap((c) => c.txns.map((txn) => ({ ...txn, customerName: c.name, customerId: c.id })))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 8);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
        <ListSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-[var(--text-faint)]">{configured ? t('liveFrom') : 'Preview from local CSV'}</p>

      {/* Today's snapshot */}
      {daily && (daily.sold > 0 || daily.purchased > 0 || daily.collected > 0) && (
        <Card>
          <SectionHeader
            title={`${t('dailyOps')} — ${today}`}
            icon={<CalendarIcon size={16} />}
            action={<Link href="/daily" className="text-xs text-[var(--bg-primary)] hover:underline">{t('dailyOps')} →</Link>}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('soldToday')}</p>
              <p className="text-base font-bold">{fmt(daily.sold)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('purchasedToday')}</p>
              <p className="text-base font-bold">{fmt(daily.purchased)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('collectedToday')}</p>
              <p className="text-base font-bold text-[var(--bg-success)]">{fmt(daily.collected)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('estProfit')}</p>
              <p className={`text-base font-bold ${daily.estProfit >= 0 ? 'text-[var(--bg-success)]' : 'text-[var(--bg-primary)]'}`}>
                {fmt(daily.estProfit)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Main stats */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label={t('due')} value={fmt(totalDue)} accent="primary" icon={<DollarIcon size={14} />} />
        <StatCard label={t('billed')} value={fmt(totalBilled)} icon={<TrendingIcon size={14} />} />
        <StatCard label={t('paid')} value={fmt(totalPaid)} accent="success" icon={<DollarIcon size={14} />} />
        <StatCard label={t('customersCount')} value={String(customers.length)} icon={<UsersIcon size={14} />} />
      </section>

      {/* Month stats */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label={`${t('thisMonth')} · ${t('billed')}`} value={fmt(monthBilled)} />
        <StatCard label={`${t('thisMonth')} · ${t('paid')}`} value={fmt(monthPaid)} />
        <StatCard label={t('bills')} value={String(customers.reduce((s, c) => s + c.txns.filter((t) => t.type === 'bill').length, 0))} />
      </section>

      {/* Stock alerts */}
      {(lowStock.length > 0 || outStock.length > 0) && (
        <Card>
          <SectionHeader
            title={t('navStock')}
            icon={<PackageIcon size={16} />}
            action={<Link href="/stock" className="text-xs text-[var(--bg-primary)] hover:underline">{t('navStock')} →</Link>}
          />
          <div className="flex flex-wrap gap-2">
            {outStock.map((s) => (
              <span key={s.itemKey} className="rounded-lg bg-[var(--bg-primary)] px-2.5 py-1 text-xs text-[var(--text-on-primary)]">
                {s.itemName} — {t('outOfStock')}
              </span>
            ))}
            {lowStock.map((s) => (
              <span key={s.itemKey} className="rounded-lg bg-[var(--bg-warning)] px-2.5 py-1 text-xs text-[var(--text-primary)]">
                {s.itemName} — {s.qty} {s.unit || ''} {t('lowStock')}
              </span>
            ))}
          </div>
        </Card>
      )}

      {customers.length === 0 && (
        <Card>
          <EmptyState
            icon={<UsersIcon size={48} />}
            title={t('noCustomers')}
            description="Upload a bill or create a quick bill to get started."
            action={{ label: t('uploadBill'), href: '/upload' }}
          />
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader
            title={t('topDues')}
            icon={<DollarIcon size={16} />}
            action={<Link href="/customers" className="text-xs text-[var(--bg-primary)] hover:underline">{t('allCustomers')}</Link>}
          />
          <ul className="divide-y divide-[var(--border-light)]">
            {topDues.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:opacity-80">
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
        </Card>

        <Card>
          <SectionHeader title={t('recentActivity')} icon={<CalendarIcon size={16} />} />
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--text-faint)] py-3">{t('noActivity')}</p>
          ) : (
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
          )}
        </Card>
      </section>
    </div>
  );
}
