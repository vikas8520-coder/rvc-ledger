'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { Card, EmptyState, PageHeader, StatSkeleton } from '../components/ui';
import { TrendingIcon, ClockIcon } from '../components/Icons';
import { fmt } from '@/lib/format';
import { ItemRateHistory } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TREND_LABELS: Record<string, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
  mixed: '↕',
};

const TREND_COLORS: Record<string, string> = {
  up: 'text-[var(--bg-success)]',
  down: 'text-[var(--bg-primary)]',
  flat: 'text-[var(--text-muted)]',
  mixed: 'text-[#c4622d]',
};

export default function RateSheetPage() {
  const { t } = useI18n();
  const [date, setDate] = useState(today());
  const [items, setItems] = useState<ItemRateHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/rate-history?date=${date}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('rateSheet')} subtitle={t('rateSheetHelp')} />
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-card)]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('rateSheet')}
        subtitle={t('rateSheetHelp')}
        actions={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
          />
        }
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<TrendingIcon size={48} />} title={t('noRateData')} />
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isExpanded = expanded === item.itemName;
            const priceDrop = item.firstRate && item.lastRate && item.firstRate > item.lastRate
              ? ((item.firstRate - item.lastRate) / item.firstRate * 100).toFixed(1)
              : null;

            return (
              <Card key={item.itemName} padding="p-3">
                <button
                  onClick={() => setExpanded(isExpanded ? null : item.itemName)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {item.itemName}
                      <span className={`text-sm font-bold ${TREND_COLORS[item.trend]}`}>
                        {TREND_LABELS[item.trend]}
                      </span>
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {item.entries.length} {t('sales')} · {t('range')}: {fmt(item.minRate || 0)} – {fmt(item.maxRate || 0)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold">
                      {fmt(item.lastRate || 0)}
                    </p>
                    {priceDrop && (
                      <p className="text-[10px] text-[var(--bg-primary)]">
                        -{priceDrop}% {t('fromOpen')}
                      </p>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-3 border-t border-[var(--border-light)] pt-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--text-muted)]">
                          <th className="py-1 text-left">{t('time')}</th>
                          <th className="py-1 text-left">{t('customer')}</th>
                          <th className="py-1 text-right">{t('qty')}</th>
                          <th className="py-1 text-right">{t('rate')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.entries.map((e, i) => (
                          <tr key={i} className="border-t border-[var(--border-light)]">
                            <td className="py-1.5">{e.time || '—'}</td>
                            <td className="py-1.5 truncate">{e.customerName || '—'}</td>
                            <td className="py-1.5 text-right">{e.qty || '—'}</td>
                            <td className="py-1.5 text-right font-medium">{fmt(e.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
