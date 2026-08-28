'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { fmt, fmtDate } from '@/lib/format';
import { StockLevel } from '@/lib/types';

export default function StockPage() {
  const { t } = useI18n();
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  useEffect(() => {
    Promise.all([
      fetch('/api/stock').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([d, s]) => {
        setStock(d.stock || []);
        const threshold = Number(s.settings?.lowStockThreshold);
        if (threshold > 0) setLowStockThreshold(threshold);
      })
      .catch(() => setStock([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t('navStock')}</h1>
      <p className="text-xs text-[var(--text-faint)]">{t('stockHelp')}</p>

      {stock.length === 0 && (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">{t('noStock')}</p>
      )}

      {stock.length > 0 && (
        <div className="overflow-x-auto rounded-lg bg-[var(--bg-card)]">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] text-[var(--text-muted)]">
                <th className="px-3 py-2">{t('itemName')}</th>
                <th className="px-3 py-2 text-right">{t('inStock')}</th>
                <th className="px-3 py-2 text-right">{t('lastBuyRate')}</th>
                <th className="px-3 py-2">{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => {
                const isOut = s.qty <= 0;
                const isLow = s.qty > 0 && s.qty < lowStockThreshold;
                return (
                  <tr key={s.itemKey} className="border-t border-[var(--border-light)]">
                    <td className="px-3 py-2 font-medium">
                      {s.itemName}
                      {isOut && <span className="ml-2 rounded bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] text-[var(--text-on-primary)]">{t('outOfStock')}</span>}
                      {isLow && <span className="ml-2 rounded bg-[var(--bg-warning)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)]">{t('lowStock')}</span>}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${isOut ? 'text-[var(--bg-primary)]' : isLow ? 'text-[#c4622d]' : 'text-[var(--bg-success)]'}`}>
                      {s.qty} {s.unit || ''}
                    </td>
                    <td className="px-3 py-2 text-right">{s.lastRate ? `${fmt(s.lastRate)}/${s.unit || 'unit'}` : '—'}</td>
                    <td className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{s.lastPurchaseDate ? fmtDate(s.lastPurchaseDate) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
