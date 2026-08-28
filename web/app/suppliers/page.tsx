'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { downloadCsv, suppliersCsv } from '@/lib/statement';
import { Supplier } from '@/lib/types';

export default function SuppliersPage() {
  const { t } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = () => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers || []))
      .catch(() => setSuppliers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? suppliers.filter((s) => s.name.toLowerCase().includes(needle)) : suppliers;
    return [...filtered].sort((a, b) => b.balance - a.balance);
  }, [suppliers, q]);

  if (loading) return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t('navSuppliers')}</h1>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchSuppliers')}
            className="min-w-0 flex-1 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm sm:w-56 sm:flex-none"
          />
          <button
            onClick={() => downloadCsv('rvc-suppliers.csv', suppliersCsv(suppliers))}
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
          >
            {t('exportCsv')}
          </button>
        </div>
      </div>

      {list.length === 0 && <p className="text-sm text-[var(--text-faint)]">{t('noSuppliers')}</p>}

      <ul className="divide-y divide-[var(--border-light)] overflow-hidden rounded-lg bg-[var(--bg-card)]">
        {list.map((s) => (
          <li key={s.id}>
            <Link href={`/suppliers/${s.id}`} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-[#efe8db]">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t('purchased')} {fmt(s.purchased)} · {t('paid')} {fmt(s.paid)}
                </p>
              </div>
              <p className={`shrink-0 text-sm font-semibold ${s.balance > 0 ? 'text-[var(--bg-primary)]' : 'text-[var(--bg-success)]'}`}>
                {fmt(s.balance)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
