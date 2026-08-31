'use client';

import { useEffect, useState } from 'react';
import { usePersistentState } from '../components/usePersistentState';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { Card, SectionHeader, StatCard, EmptyState, StatSkeleton, PageHeader } from '../components/ui';
import { CalendarIcon, DollarIcon, TrendingIcon, PackageIcon, BoxIcon, AlertIcon } from '../components/Icons';
import { fmt } from '@/lib/format';
import { DailySummary, StockLevel, Customer } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DailyOpsPage() {
  const { t, lang } = useI18n();
  const [date, setDate] = usePersistentState('daily-date', today());
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

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title={t('dailyOps')} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
      </div>
    );
  }

  const totalDue = customers.reduce((s, c) => s + c.due, 0);
  const uiLang = getUiLang(lang);
  const todayBills = customers.flatMap((c) =>
    c.txns.filter((tx) => tx.type === 'bill' && tx.date === date).map((tx) => ({ ...tx, customerName: formatCustomerName(c, uiLang), customerId: c.id }))
  );
  const todayPayments = customers.flatMap((c) =>
    c.txns.filter((tx) => tx.type === 'payment' && tx.date === date).map((tx) => ({ ...tx, customerName: formatCustomerName(c, uiLang), customerId: c.id }))
  );

  const lowStock = stock.filter((s) => s.qty > 0 && s.qty < 5);
  const outStock = stock.filter((s) => s.qty <= 0);
  const stockValue = stock.reduce((s, st) => s + (st.lastRate || 0) * st.qty, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('dailyOps')}
        subtitle={date}
        actions={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
          />
        }
      />

      {/* P&L Summary */}
      {summary && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('soldToday')} value={fmt(summary.sold)} sub={`${summary.saleCount} ${t('bills')}`} icon={<TrendingIcon size={14} />} />
          <StatCard label={t('cogs')} value={fmt(summary.cogs)} icon={<PackageIcon size={14} />} />
          <StatCard label={t('grossProfit')} value={fmt(summary.grossProfit)} accent={summary.grossProfit >= 0 ? 'success' : 'primary'} icon={<DollarIcon size={14} />} />
          <StatCard label={t('stockValue')} value={fmt(summary.stockValue)} icon={<BoxIcon size={14} />} />
        </section>
      )}

      {/* Cash position */}
      {summary && (
        <Card>
          <SectionHeader title={t('cashPosition')} icon={<DollarIcon size={16} />} />
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('purchasedToday')}</p>
              <p className="font-semibold">{fmt(summary.purchased)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('collected')}</p>
              <p className="font-semibold text-[var(--bg-success)]">{fmt(summary.collected)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('supplierPaid')}</p>
              <p className="font-semibold text-[var(--bg-primary)]">{fmt(summary.supplierPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('netCash')}</p>
              <p className={`font-bold ${summary.netCash >= 0 ? 'text-[var(--bg-success)]' : 'text-[var(--bg-primary)]'}`}>
                {fmt(summary.netCash)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Outstanding credit + stock value */}
      <section className="grid grid-cols-2 gap-2">
        <StatCard label={t('totalOutstanding')} value={fmt(totalDue)} accent="primary" icon={<DollarIcon size={14} />} />
        <StatCard label={t('stockValue')} value={fmt(stockValue)} icon={<BoxIcon size={14} />} />
      </section>

      {/* Today's sales */}
      <Card>
        <SectionHeader title={`${t('todaySales')} (${todayBills.length})`} icon={<TrendingIcon size={16} />} />
        {todayBills.length === 0 ? (
          <EmptyState icon={<TrendingIcon size={40} />} title={t('noSalesToday')} />
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {todayBills.map((tx) => (
              <li key={tx.id}>
                <Link href={`/customers/${tx.customerId}`} className="flex items-center justify-between gap-2 py-2.5 hover:opacity-80">
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
      </Card>

      {/* Today's collections */}
      <Card>
        <SectionHeader title={`${t('todayCollections')} (${todayPayments.length})`} icon={<DollarIcon size={16} />} />
        {todayPayments.length === 0 ? (
          <EmptyState icon={<DollarIcon size={40} />} title={t('noCollectionsToday')} />
        ) : (
          <ul className="divide-y divide-[var(--border-light)]">
            {todayPayments.map((tx) => (
              <li key={tx.id}>
                <Link href={`/customers/${tx.customerId}`} className="flex items-center justify-between gap-2 py-2.5 hover:opacity-80">
                  <span className="truncate text-sm font-medium">{tx.customerName}</span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--bg-success)]">{fmt(tx.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Stock alerts */}
      {(lowStock.length > 0 || outStock.length > 0) && (
        <Card>
          <SectionHeader
            title={t('stockAlerts')}
            icon={<AlertIcon size={16} />}
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

      {/* Wastage */}
      {summary && summary.wastageCost > 0 && (
        <Card className="border-[var(--bg-warning)]">
          <div className="flex items-center gap-2">
            <AlertIcon size={16} className="text-[#c4622d]" />
            <p className="text-sm">
              <span className="font-semibold">{t('navWastage')}:</span> {fmt(summary.wastageCost)}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
