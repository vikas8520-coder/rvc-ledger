'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
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

  if (loading) return <p className="text-sm text-[#8a7a6a]">{t('loading')}</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{t('navReports')}</h1>
      <p className="text-xs text-[#8a7a6a]">{t('reportsHelp')}</p>

      {/* Monthly summary */}
      <section className="rounded-lg bg-[#e8e0d2] p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('month')}</h2>
          <button onClick={exportMonths} className="text-xs text-[#2d6b4f] hover:underline">
            {t('exportReport')}
          </button>
        </div>
        {months.length === 0 ? (
          <p className="py-3 text-center text-sm text-[#8a7a6a]">{t('noData')}</p>
        ) : (
          <table className="mt-2 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] text-[#7a6a5a]">
                <th className="py-1">{t('month')}</th>
                <th className="py-1 text-right">{t('billedSales')}</th>
                <th className="py-1 text-right">{t('collected')}</th>
                <th className="py-1 text-right">{t('purchased')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-[#d9d0c2]">
                  <td className="py-1.5">{monthLabel(m.month)}</td>
                  <td className="py-1.5 text-right">{fmt(m.billed)}</td>
                  <td className="py-1.5 text-right">{fmt(m.collected)}</td>
                  <td className="py-1.5 text-right">{fmt(m.purchased)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Item rates & margins */}
      <section className="rounded-lg bg-[#e8e0d2] p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('itemRates')}</h2>
          <button onClick={exportItems} className="text-xs text-[#2d6b4f] hover:underline">
            {t('exportReport')}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="py-3 text-center text-sm text-[#8a7a6a]">{t('noData')}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums">
              <thead>
                <tr className="text-left text-[11px] text-[#7a6a5a]">
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
                  <tr key={i.key} className="border-t border-[#d9d0c2]">
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
                        <span className={i.marginPerUnit >= 0 ? 'text-[#2d6b4f]' : 'text-[#8b2e2e]'}>
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
                  <tr className="border-t border-[#c9c0b2] font-semibold">
                    <td className="py-1.5" colSpan={5}>{t('estProfit')}</td>
                    <td className="py-1.5 text-right text-[#2d6b4f]">{fmt(totalEstProfit)}</td>
                  </tr>
                  {totalWastage > 0 && (
                    <>
                      <tr className="text-[#8b2e2e]">
                        <td className="py-1.5" colSpan={5}>{t('totalWastage')}</td>
                        <td className="py-1.5 text-right">-{fmt(totalWastage)}</td>
                      </tr>
                    </>
                  )}
                  {totalExpenses > 0 && (
                    <tr className="text-[#8b2e2e]">
                      <td className="py-1.5" colSpan={5}>{t('totalExpenses')}</td>
                      <td className="py-1.5 text-right">-{fmt(totalExpenses)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[#c9c0b2] font-semibold">
                    <td className="py-1.5" colSpan={5}>{t('netProfit')}</td>
                    <td className="py-1.5 text-right text-[#2d6b4f]">{fmt(netEstProfit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      {/* Top customers */}
      <section className="rounded-lg bg-[#e8e0d2] p-3">
        <h2 className="text-sm font-semibold">{t('topCustomers')}</h2>
        {top.length === 0 ? (
          <p className="py-3 text-center text-sm text-[#8a7a6a]">{t('noData')}</p>
        ) : (
          <table className="mt-2 w-full text-sm tabular-nums">
            <tbody>
              {top.map((c) => (
                <tr key={c.id} className="border-t border-[#d9d0c2]">
                  <td className="py-1.5">{c.name}</td>
                  <td className="py-1.5 text-right">{fmt(c.billed)}</td>
                  <td className="py-1.5 text-right text-[#8b2e2e]">{c.due > 0 ? fmt(c.due) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
