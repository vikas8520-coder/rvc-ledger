'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from './components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { useDashboard } from './components/useDashboard';
import TxnCard from './components/TxnCard';
import AgingBadge from './components/AgingBadge';
import { Card, SectionHeader, StatCard, EmptyState, StatSkeleton, ListSkeleton } from './components/ui';
import { UsersIcon, DollarIcon, PackageIcon, CalendarIcon, TrendingIcon } from './components/Icons';
import { fmt } from '@/lib/format';
import { computeAging } from '@/lib/statement';
import { StockLevel, DailySummary } from '@/lib/types';

interface FarmerSummary {
  farmer: string;
  totalSales: number;
  totalBags: number;
  totalKgs: number;
  totalHamali: number;
  commission: number;
  netPayable: number;
  lineCount: number;
}

export default function Home() {
  const { t, lang } = useI18n();

  // FY selector: null = current FY (default), 'all' = all-time, number = specific FY
  const [fyParam, setFyParam] = useState<number | 'all' | null>(null);
  const { customers, configured, loading, fySummary, fyUsed } = useDashboard(fyParam === 'all' ? null : fyParam);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [stockLoading, setStockLoading] = useState(true);
  const [commissionPct, setCommissionPct] = useState<number | null>(null);
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);

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
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const pct = d.settings?.commissionPct;
        if (pct) setCommissionPct(Number(pct));
      })
      .catch(() => {});
  }, []);

  // Fetch farmer summary when FY changes
  useEffect(() => {
    if (fyParam === 'all') {
      setFarmers([]);
      return;
    }
    const fy = fyParam === null ? currentFY : fyParam;
    fetch(`/api/farmers?fy=${fy}`)
      .then((r) => r.json())
      .then((d) => setFarmers(d.farmers || []))
      .catch(() => setFarmers([]));
  }, [fyParam]);

  const today = new Date().toISOString().slice(0, 10);

  // FY label
  const now = new Date();
  const currentFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyLabel = fyParam === 'all' ? t('allTime') : fyParam === null ? `FY ${currentFY}-${String((currentFY + 1) % 100).padStart(2, '0')}` : `FY ${fyParam}-${String((fyParam + 1) % 100).padStart(2, '0')}`;

  // Use fySummary from backend if available, otherwise calculate from customers
  const totalSales = fySummary?.totalSales ?? customers.reduce((s, c) => s + c.billed, 0);
  const totalPayments = fySummary?.totalPayments ?? customers.reduce((s, c) => s + c.paid, 0);
  const totalOutstanding = fySummary?.totalOutstanding ?? customers.reduce((s, c) => s + c.due, 0);
  const customerCount = fySummary?.customerCount ?? customers.length;
  const commissionEarned = commissionPct ? (totalSales * commissionPct / 100) : 0;

  const lowStock = stock.filter((s) => s.qty > 0 && s.qty < 5);
  const outStock = stock.filter((s) => s.qty <= 0);

  const topDues = [...customers].filter((c) => c.due > 0).sort((a, b) => b.due - a.due).slice(0, 6);
  const recent = customers
    .flatMap((c) => c.txns.map((txn) => ({ ...txn, customerName: c.name, customerId: c.id, englishName: c.englishName, teluguName: c.teluguName, hindiName: c.hindiName })))
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

      {/* FY selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">{t('financialYear')}:</span>
        {[
          { key: null, label: `FY ${currentFY}-${String((currentFY + 1) % 100).padStart(2, '0')}` },
          { key: currentFY - 1, label: `FY ${currentFY - 1}-${String(currentFY % 100).padStart(2, '0')}` },
          { key: 'all' as const, label: t('allTime') },
        ].map((opt) => (
          <button
            key={String(opt.key)}
            onClick={() => setFyParam(opt.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              fyParam === opt.key
                ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                : 'border border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-base)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Today's snapshot */}
      {daily && (daily.sold > 0 || daily.purchased > 0 || daily.collected > 0) && (
        <Card>
          <SectionHeader
            title={`${t('dailyOps')} — ${today}`}
            icon={<CalendarIcon size={16} />}
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
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('grossProfit')}</p>
              <p className={`text-base font-bold ${daily.grossProfit >= 0 ? 'text-[var(--bg-success)]' : 'text-[var(--bg-primary)]'}`}>
                {fmt(daily.grossProfit)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* FY Summary — the 5 core questions */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">{fyLabel}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('fySales')} value={fmt(totalSales)} icon={<TrendingIcon size={14} />} />
          <StatCard label={t('fyPayments')} value={fmt(totalPayments)} accent="success" icon={<DollarIcon size={14} />} />
          <StatCard label={t('fyOutstanding')} value={fmt(totalOutstanding)} accent="primary" icon={<DollarIcon size={14} />} />
          <StatCard label={t('customersCount')} value={String(customerCount)} icon={<UsersIcon size={14} />} />
        </div>
        {commissionPct && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <StatCard label={`${t('commissionEarned')} (${commissionPct}%)`} value={fmt(commissionEarned)} accent="success" icon={<TrendingIcon size={14} />} />
            <StatCard label={t('fyNetPosition')} value={fmt(totalOutstanding - commissionEarned)} icon={<DollarIcon size={14} />} />
          </div>
        )}
      </section>

      {/* Farmer-wise summary */}
      {farmers.length > 0 && (
        <Card>
          <SectionHeader title={t('farmerSummary')} icon={<TrendingIcon size={16} />} />
          <div className="space-y-2 md:hidden">
            {farmers.map((f) => (
              <div key={f.farmer} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-base)] p-3">
                <p className="font-medium">{f.farmer}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {f.lineCount} {t('lines')}
                  {f.totalBags > 0 ? ` · ${f.totalBags} ${t('totalBags')}` : ''}
                  {f.totalKgs > 0 ? ` · ${f.totalKgs} ${t('totalKgs')}` : ''}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <span className="text-[var(--text-muted)]">{t('fySales')}</span>
                  <span className="text-right tabular-nums">{fmt(f.totalSales)}</span>
                  <span className="text-[var(--text-muted)]">{t('commissionEarned')}</span>
                  <span className="text-right tabular-nums">{f.commission > 0 ? fmt(f.commission) : '—'}</span>
                  <span className="text-[var(--text-muted)]">{t('netPayable')}</span>
                  <span className="text-right font-semibold tabular-nums text-[var(--bg-success)]">{fmt(f.netPayable)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-light)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-2 py-2 text-left">{t('farmer')}</th>
                  <th className="px-2 py-2 text-right">{t('lines')}</th>
                  <th className="px-2 py-2 text-right">{t('totalBags')}</th>
                  <th className="px-2 py-2 text-right">{t('totalKgs')}</th>
                  <th className="px-2 py-2 text-right">{t('fySales')}</th>
                  <th className="px-2 py-2 text-right">{t('hamali')}</th>
                  <th className="px-2 py-2 text-right">{t('commissionEarned')}</th>
                  <th className="px-2 py-2 text-right">{t('netPayable')}</th>
                </tr>
              </thead>
              <tbody>
                {farmers.map((f) => (
                  <tr key={f.farmer} className="border-b border-[var(--border-card)]">
                    <td className="px-2 py-2 font-medium">{f.farmer}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{f.lineCount}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{f.totalBags > 0 ? f.totalBags : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{f.totalKgs > 0 ? f.totalKgs : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(f.totalSales)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{f.totalHamali > 0 ? fmt(f.totalHamali) : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[var(--bg-primary)]">{f.commission > 0 ? fmt(f.commission) : '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-[var(--bg-success)]">{fmt(f.netPayable)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--bg-primary)] font-bold">
                  <td className="px-2 py-2" colSpan={4}>{t('total')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(farmers.reduce((s, f) => s + f.totalSales, 0))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(farmers.reduce((s, f) => s + f.totalHamali, 0))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(farmers.reduce((s, f) => s + f.commission, 0))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(farmers.reduce((s, f) => s + f.netPayable, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Stock alerts */}
      {(lowStock.length > 0 || outStock.length > 0) && (
        <Card>
          <SectionHeader
            title={t('navStock')}
            icon={<PackageIcon size={16} />}
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
            description="Record stock received from a farmer or make a sale to get started."
            action={{ label: t('receiveStock'), href: '/receive' }}
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
                    <span className="truncate font-medium">{formatCustomerName(c, getUiLang(lang))}</span>
                    <AgingBadge aging={computeAging(c.txns)} />
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--bg-primary)]">{fmt(c.due)}</span>
                </Link>
              </li>
            ))}
            {topDues.length === 0 && <li className="py-3 text-sm text-[var(--text-faint)]">{t('noOutstanding')}</li>}
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
                    {formatCustomerName({ name: txn.customerName, englishName: txn.englishName, teluguName: txn.teluguName, hindiName: txn.hindiName }, getUiLang(lang))}
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
