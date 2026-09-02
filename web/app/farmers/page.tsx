'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { Card, SectionHeader, StatCard, EmptyState, ListSkeleton, PageHeader } from '../components/ui';
import { StoreIcon, SearchIcon, TrendingIcon, DollarIcon, PackageIcon } from '../components/Icons';
import { fmt } from '@/lib/format';

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

export default function FarmersPage() {
  const { t } = useI18n();
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [commissionPct, setCommissionPct] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/farmers')
      .then((r) => r.json())
      .then((d) => setFarmers(d.farmers || []))
      .catch(() => setFarmers([]))
      .finally(() => setLoading(false));
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const pct = d.settings?.commissionPct;
        if (pct) setCommissionPct(Number(pct));
      })
      .catch(() => {});
  }, []);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return farmers;
    return farmers.filter((f) => f.farmer.toLowerCase().includes(query));
  }, [farmers, q]);

  const totalSales = farmers.reduce((s, f) => s + f.totalSales, 0);
  const totalNetPayable = farmers.reduce((s, f) => s + f.netPayable, 0);
  const totalBags = farmers.reduce((s, f) => s + f.totalBags, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('navFarmers')} />
        <ListSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('navFarmers')}
        subtitle={`${farmers.length} ${t('farmers')}`}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label={t('fySales')} value={fmt(totalSales)} icon={<TrendingIcon size={14} />} />
        <StatCard label={t('netPayable')} value={fmt(totalNetPayable)} accent="success" icon={<DollarIcon size={14} />} />
        <StatCard label={t('totalBags')} value={String(totalBags)} icon={<PackageIcon size={14} />} />
      </div>

      {commissionPct != null && (
        <p className="text-xs text-[var(--text-muted)]">
          {t('commissionEarned')}: {commissionPct}% · {t('netPayable')} = {t('fySales')} − {t('commissionEarned')} − {t('hamali')}
        </p>
      )}

      {/* Search */}
      <div className="relative">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchFarmers')}
          className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {/* Farmer list */}
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<StoreIcon size={48} />}
            title={t('noFarmers')}
            description={t('noFarmersHint')}
            action={{ label: t('navDataEntry'), href: '/entry' }}
          />
        </Card>
      ) : (
        <Card padding="p-0">
          <ul className="divide-y divide-[var(--border-light)]">
            {list.map((f) => (
              <li key={f.farmer}>
                <Link
                  href={`/farmers/${encodeURIComponent(f.farmer)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.farmer}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {f.lineCount} {t('lines')}
                      {f.totalBags > 0 ? ` · ${f.totalBags} ${t('totalBags')}` : ''}
                      {f.totalKgs > 0 ? ` · ${f.totalKgs} kg` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{fmt(f.totalSales)}</p>
                    <p className="text-[10px] text-[var(--text-faint)]">
                      {t('netPayable')}: {fmt(f.netPayable)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
