'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { useDashboard } from '../components/useDashboard';
import AgingBadge from '../components/AgingBadge';
import { fmt } from '@/lib/format';
import { computeAging, customersCsv, downloadCsv } from '@/lib/statement';

export default function CustomersPage() {
  const { t } = useI18n();
  const { customers, loading } = useDashboard();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'due' | 'name' | 'oldest'>('due');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? customers.filter((c) => c.name.toLowerCase().includes(needle))
      : customers;
    const withAging = filtered.map((c) => ({ c, aging: computeAging(c.txns) }));
    return withAging.sort((a, b) => {
      if (sort === 'name') return a.c.name.localeCompare(b.c.name);
      if (sort === 'oldest') return b.aging.oldestDays - a.aging.oldestDays;
      return b.c.due - a.c.due;
    });
  }, [customers, q, sort]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t('navCustomers')}</h1>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchCustomers')}
            className="min-w-0 flex-1 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm sm:w-56 sm:flex-none"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'due' | 'name' | 'oldest')}
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
          >
            <option value="due">{t('sortDue')}</option>
            <option value="oldest">{t('overdue')}</option>
            <option value="name">{t('sortName')}</option>
          </select>
          <button
            onClick={() => downloadCsv('rvc-customers.csv', customersCsv(customers))}
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
          >
            {t('exportCsv')}
          </button>
        </div>
      </div>

      {list.length === 0 && <p className="text-sm text-[var(--text-faint)]">{t('noCustomers')}</p>}

      <ul className="divide-y divide-[var(--border-light)] overflow-hidden rounded-lg bg-[var(--bg-card)]">
        {list.map(({ c, aging }) => (
          <li key={c.id}>
            <Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-[#efe8db]">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium">
                  {c.name}
                  <AgingBadge aging={aging} />
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t('billed')} {fmt(c.billed)} · {t('paid')} {fmt(c.paid)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-[var(--bg-primary)]">{fmt(c.due)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
