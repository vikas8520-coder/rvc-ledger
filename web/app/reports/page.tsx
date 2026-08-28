'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
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
  const { t } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<PurchaseView[]>([]);
  const [wastage, setWastage] = useState<WastageEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then((r) => r.json()),
      fetch('/api/purchases').then((r) => r.json()),
      fetch('/api/wastage').then((r) => r.json()),
      fetch('/api/expenses').then((r) => r.json()),
    ])
      .then(([dash, pur, wast, exp]) => {
        setCustomers(dash.customers || []);
        setPurchases(pur.purchases || []);
        setWastage(wast.entries || []);
        setExpenses(exp.entries || []);
      })
      .catch(() => {
        setCustomers([]);
        setPurchases([]);
        setWastage([]);
        setExpenses([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const months = useMemo(() => monthlySummary(customers, purchases), [customers, purchases]);
  const items = useMemo(() => itemStats(customers, purchases), [customers, purchases]);
  const top = useMemo(() => topCustomers(customers, 5), [customers]);

  const totalEstProfit = items.reduce((s, i) => s + (i.estMargin || 0), 0);
  const totalWastage = wastage.reduce((s, w) => s + w.estCost, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netEstProfit = totalEstProfit - totalWastage - totalExpenses;

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
                  <td className="py-1.5">{c.name}</td>
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
