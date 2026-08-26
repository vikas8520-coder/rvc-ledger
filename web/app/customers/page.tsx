'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { useDashboard } from '../components/useDashboard';
import { fmt } from '@/lib/format';

export default function CustomersPage() {
  const { t } = useI18n();
  const { customers, loading } = useDashboard();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'due' | 'name'>('due');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? customers.filter((c) => c.name.toLowerCase().includes(needle))
      : customers;
    return [...filtered].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.due - a.due));
  }, [customers, q, sort]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-[#8a7a6a]">{t('loading')}</p>;
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
            className="min-w-0 flex-1 rounded-md border border-[#c9c0b2] bg-white px-3 py-1.5 text-sm sm:w-56 sm:flex-none"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'due' | 'name')}
            className="rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
          >
            <option value="due">{t('sortDue')}</option>
            <option value="name">{t('sortName')}</option>
          </select>
        </div>
      </div>

      {list.length === 0 && <p className="text-sm text-[#8a7a6a]">{t('noCustomers')}</p>}

      <ul className="divide-y divide-[#d9d0c2] overflow-hidden rounded-lg bg-[#e8e0d2]">
        {list.map((c) => (
          <li key={c.id}>
            <Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-[#efe8db]">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-[11px] text-[#7a6a5a]">
                  {t('billed')} {fmt(c.billed)} · {t('paid')} {fmt(c.paid)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-[#8b2e2e]">{fmt(c.due)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
