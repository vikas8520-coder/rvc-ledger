'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { Card, SectionHeader, Button, EmptyState, PageHeader, StatCard, StatSkeleton } from '../components/ui';
import { ChartIcon, DownloadIcon, TrendingIcon, DollarIcon, PackageIcon } from '../components/Icons';
import { fmt } from '@/lib/format';
import { Customer, PurchaseView, WastageEntry, ExpenseEntry } from '@/lib/types';
import { monthlySummary, itemStats, topCustomers } from '@/lib/reports';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { t, lang } = useI18n();
  const [fyParam, setFyParam] = useState<number | 'all' | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fySummary, setFySummary] = useState<{ totalSales: number; totalPayments: number; totalOutstanding: number; customerCount: number } | null>(null);
  const [commissionPct, setCommissionPct] = useState<number | null>(null);
  const [purchases, setPurchases] = useState<PurchaseView[]>([]);
  const [wastage, setWastage] = useState<WastageEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // FY label
  const now = new Date();
  const currentFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyLabel = fyParam === 'all' ? t('allTime') : fyParam === null ? `FY ${currentFY}-${String((currentFY + 1) % 100).padStart(2, '0')}` : `FY ${fyParam}-${String((fyParam + 1) % 100).padStart(2, '0')}`;

  useEffect(() => {
    const fyQuery = fyParam === 'all' ? '?fy=all' : fyParam === null ? '' : `?fy=${fyParam}`;
    Promise.all([
      fetch(`/api/dashboard${fyQuery}`).then((r) => r.json()),
      fetch('/api/purchases').then((r) => r.json()),
      fetch('/api/wastage').then((r) => r.json()),
      fetch('/api/expenses').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([dash, pur, wast, exp, settings]) => {
        setCustomers(dash.customers || []);
        setFySummary(dash.fySummary || null);
        setPurchases(pur.purchases || []);
        setWastage(wast.entries || []);
        setExpenses(exp.entries || []);
        const pct = settings.settings?.commissionPct;
        if (pct) setCommissionPct(Number(pct));
      })
      .catch(() => {
        setCustomers([]);
        setPurchases([]);
        setWastage([]);
        setExpenses([]);
      })
      .finally(() => setLoading(false));
  }, [fyParam]);

  const months = useMemo(() => monthlySummary(customers, purchases), [customers, purchases]);
  const items = useMemo(() => itemStats(customers, purchases), [customers, purchases]);
  const top = useMemo(() => topCustomers(customers, 5), [customers]);

  const totalEstProfit = items.reduce((s, i) => s + (i.estMargin || 0), 0);
  const totalWastage = wastage.reduce((s, w) => s + w.estCost, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netEstProfit = totalEstProfit - totalWastage - totalExpenses;

  // FY summary from backend (or fallback to customer totals)
  const fySales = fySummary?.totalSales ?? customers.reduce((s, c) => s + c.billed, 0);
  const fyPayments = fySummary?.totalPayments ?? customers.reduce((s, c) => s + c.paid, 0);
  const fyOutstanding = fySummary?.totalOutstanding ?? customers.reduce((s, c) => s + c.due, 0);
  const commissionEarned = commissionPct ? (fySales * commissionPct / 100) : 0;

  const exportMonths = () => {
    const rows: (string | number)[][] = [[t('month'), t('billedSales'), t('collected'), t('purchased')]];
    for (const m of months) rows.push([monthLabel(m.month), m.billed, m.collected, m.purchased]);
    downloadCsv('rvc-monthly.csv', rows);
  };

  const exportItems = () => {
    const rows: (string | number)[][] = [
      [t('itemName'), t('avgBuyRate'), t('avgSellRate'), t('lastBuyRate'), t('marginPerUnit'), t('estMargin')],
    ];
    for (const i of items) {
      rows.push([
        i.name,
        i.avgBuyRate ? Math.round(i.avgBuyRate * 100) / 100 : '',
        i.avgSellRate ? Math.round(i.avgSellRate * 100) / 100 : '',
        i.lastBuyRate || '',
        i.marginPerUnit ? Math.round(i.marginPerUnit * 100) / 100 : '',
        i.estMargin ? Math.round(i.estMargin) : '',
      ]);
    }
    downloadCsv('rvc-item-rates.csv', rows);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title={t('navReports')} subtitle={t('reportsHelp')} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('navReports')} subtitle={t('reportsHelp')} />

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

      {/* FY Summary */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">{fyLabel}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('fySales')} value={fmt(fySales)} icon={<TrendingIcon size={14} />} />
          <StatCard label={t('fyPayments')} value={fmt(fyPayments)} accent="success" icon={<DollarIcon size={14} />} />
          <StatCard label={t('fyOutstanding')} value={fmt(fyOutstanding)} accent="primary" icon={<DollarIcon size={14} />} />
          {commissionPct && (
            <StatCard label={`${t('commissionEarned')} (${commissionPct}%)`} value={fmt(commissionEarned)} accent="success" icon={<TrendingIcon size={14} />} />
          )}
        </div>
      </section>

      {/* Summary stats */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label={t('estProfit')} value={fmt(totalEstProfit)} accent={totalEstProfit >= 0 ? 'success' : 'primary'} icon={<TrendingIcon size={14} />} />
        <StatCard label={t('totalWastage')} value={fmt(totalWastage)} accent="warning" icon={<PackageIcon size={14} />} />
        <StatCard label={t('totalExpenses')} value={fmt(totalExpenses)} icon={<DollarIcon size={14} />} />
        <StatCard label={t('netProfit')} value={fmt(netEstProfit)} accent={netEstProfit >= 0 ? 'success' : 'primary'} icon={<TrendingIcon size={14} />} />
      </section>

      {/* Monthly summary */}
      <Card>
        <SectionHeader
          title={t('month')}
          icon={<ChartIcon size={16} />}
          action={<Button variant="outline" size="sm" onClick={exportMonths}><span className="flex items-center gap-1.5"><DownloadIcon size={14} /> {t('exportReport')}</span></Button>}
        />
        {months.length === 0 ? (
          <EmptyState icon={<ChartIcon size={40} />} title={t('noData')} />
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] text-[var(--text-muted)]">
                <th className="py-1">{t('month')}</th>
                <th className="py-1 text-right">{t('billedSales')}</th>
                <th className="py-1 text-right">{t('collected')}</th>
                <th className="py-1 text-right">{t('purchased')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-[var(--border-light)]">
                  <td className="py-1.5">{monthLabel(m.month)}</td>
                  <td className="py-1.5 text-right">{fmt(m.billed)}</td>
                  <td className="py-1.5 text-right">{fmt(m.collected)}</td>
                  <td className="py-1.5 text-right">{fmt(m.purchased)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Item rates & margins */}
      <Card>
        <SectionHeader
          title={t('itemRates')}
          icon={<TrendingIcon size={16} />}
          action={<Button variant="outline" size="sm" onClick={exportItems}><span className="flex items-center gap-1.5"><DownloadIcon size={14} /> {t('exportReport')}</span></Button>}
        />
        {items.length === 0 ? (
          <EmptyState icon={<TrendingIcon size={40} />} title={t('noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums">
              <thead>
                <tr className="text-left text-[11px] text-[var(--text-muted)]">
                  <th className="py-1">{t('itemName')}</th>
                  <th className="py-1 text-right">{t('avgBuyRate')}</th>
                  <th className="py-1 text-right">{t('avgSellRate')}</th>
                  <th className="py-1 text-right">{t('lastBuyRate')}</th>
                  <th className="py-1 text-right">{t('marginPerUnit')}</th>
                  <th className="py-1 text-right">{t('estMargin')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.key} className="border-t border-[var(--border-light)]">
                    <td className="py-1.5 pr-2">{i.name}</td>
                    <td className="py-1.5 text-right">
                      {i.avgBuyRate ? `${Math.round(i.avgBuyRate * 100) / 100}/${i.boughtUnit || ''}` : '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      {i.avgSellRate ? `${Math.round(i.avgSellRate * 100) / 100}/${i.soldUnit || ''}` : '—'}
                    </td>
                    <td className="py-1.5 text-right">{i.lastBuyRate || '—'}</td>
                    <td className="py-1.5 text-right">
                      {i.marginPerUnit !== null ? (
                        <span className={i.marginPerUnit >= 0 ? 'text-[var(--bg-success)]' : 'text-[var(--bg-primary)]'}>
                          {Math.round(i.marginPerUnit * 100) / 100}
                        </span>
                      ) : (
                        <span className="text-[#a99a8a]">{t('notComparable')}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {i.estMargin !== null ? fmt(i.estMargin) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totalEstProfit > 0 && (
                <tfoot>
                  <tr className="border-t border-[var(--border-input)] font-semibold">
                    <td className="py-1.5" colSpan={5}>{t('estProfit')}</td>
                    <td className="py-1.5 text-right text-[var(--bg-success)]">{fmt(totalEstProfit)}</td>
                  </tr>
                  {totalWastage > 0 && (
                    <tr className="text-[var(--bg-primary)]">
                      <td className="py-1.5" colSpan={5}>{t('totalWastage')}</td>
                      <td className="py-1.5 text-right">-{fmt(totalWastage)}</td>
                    </tr>
                  )}
                  {totalExpenses > 0 && (
                    <tr className="text-[var(--bg-primary)]">
                      <td className="py-1.5" colSpan={5}>{t('totalExpenses')}</td>
                      <td className="py-1.5 text-right">-{fmt(totalExpenses)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[var(--border-input)] font-semibold">
                    <td className="py-1.5" colSpan={5}>{t('netProfit')}</td>
                    <td className="py-1.5 text-right text-[var(--bg-success)]">{fmt(netEstProfit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      {/* Top customers */}
      <Card>
        <SectionHeader title={t('topCustomers')} icon={<DollarIcon size={16} />} />
        {top.length === 0 ? (
          <EmptyState icon={<DollarIcon size={40} />} title={t('noData')} />
        ) : (
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {top.map((c) => (
                <tr key={c.id} className="border-t border-[var(--border-light)]">
                  <td className="py-1.5">{formatCustomerName(c, getUiLang(lang))}</td>
                  <td className="py-1.5 text-right">{fmt(c.billed)}</td>
                  <td className="py-1.5 text-right text-[var(--bg-primary)]">{c.due > 0 ? fmt(c.due) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
