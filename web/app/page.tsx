'use client';

import Link from 'next/link';
import { useI18n } from './components/I18nProvider';
import { useDashboard } from './components/useDashboard';
import TxnCard from './components/TxnCard';
import AgingBadge from './components/AgingBadge';
import { fmt, thisMonthKey } from '@/lib/format';
import { computeAging } from '@/lib/statement';

export default function Home() {
  const { t } = useI18n();
  const { customers, configured, loading } = useDashboard();

  const totalBilled = customers.reduce((s, c) => s + c.billed, 0);
  const totalPaid = customers.reduce((s, c) => s + c.paid, 0);
  const totalDue = customers.reduce((s, c) => s + c.due, 0);
  const month = thisMonthKey();
  const monthBilled = customers.reduce(
    (s, c) => s + c.txns.filter((t) => t.type === 'bill' && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0),
    0
  );
  const monthPaid = customers.reduce(
    (s, c) => s + c.txns.filter((t) => t.type === 'payment' && t.date.startsWith(month)).reduce((a, t) => a + t.amount, 0),
    0
  );

  const topDues = [...customers].sort((a, b) => b.due - a.due).slice(0, 6);
  const recent = customers
    .flatMap((c) => c.txns.map((txn) => ({ ...txn, customerName: c.name, customerId: c.id })))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 8);

  if (loading) {
    return <p className="py-10 text-center text-sm text-[#8a7a6a]">{t('loading')}</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-[#8a7a6a]">{configured ? t('liveFrom') : 'Preview from local CSV'}</p>

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

      {customers.length === 0 && (
        <p className="rounded-lg bg-[#e8e0d2] p-4 text-center text-sm text-[#8a7a6a]">{t('noCustomers')}</p>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-[#e8e0d2] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('topDues')}</h2>
            <Link href="/customers" className="text-xs text-[#8b2e2e] hover:underline">
              {t('allCustomers')}
            </Link>
          </div>
          <ul className="divide-y divide-[#d9d0c2]">
            {topDues.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-2 py-2 hover:opacity-80">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    <AgingBadge aging={computeAging(c.txns)} />
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[#8b2e2e]">{fmt(c.due)}</span>
                </Link>
              </li>
            ))}
            {topDues.length === 0 && <li className="py-3 text-sm text-[#8a7a6a]">{t('noCustomers')}</li>}
          </ul>
        </div>

        <div className="rounded-lg bg-[#e8e0d2] p-3">
          <h2 className="mb-2 text-sm font-semibold">{t('recentActivity')}</h2>
          {recent.length === 0 && <p className="text-sm text-[#8a7a6a]">{t('noActivity')}</p>}
          <div className="space-y-2">
            {recent.map((txn) => (
              <div key={txn.id}>
                <Link href={`/customers/${txn.customerId}`} className="mb-1 block text-[11px] text-[#8b2e2e] hover:underline">
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
    <div className="rounded-lg bg-[#e8e0d2] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-[#7a6a5a]">{label}</p>
      <p className={`text-lg font-bold sm:text-xl ${accent ? 'text-[#8b2e2e]' : ''}`}>{value}</p>
    </div>
  );
}
