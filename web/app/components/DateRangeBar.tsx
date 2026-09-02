'use client';

import { useI18n } from './I18nProvider';
import {
  todayISO,
  monthStartISO,
  fyStartISO,
  fyEndISO,
  currentFyStartYear,
} from '@/lib/dateRange';

export default function DateRangeBar({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const { t } = useI18n();
  const fy = currentFyStartYear();
  const today = todayISO();

  const preset = (nextFrom: string, nextTo: string) => {
    onChange(nextFrom, nextTo);
  };

  const isToday = from === today && to === today;
  const isMonth = from === monthStartISO() && to === today;
  const isFy = from === fyStartISO(fy) && to === fyEndISO(fy);
  const isAll = !from && !to;

  const chip = (active: boolean) =>
    `min-h-10 rounded-lg px-3 text-xs font-medium ${
      active
        ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
        : 'border border-[var(--border-input)] text-[var(--text-secondary)]'
    }`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-wrap gap-1">
        <button type="button" className={chip(isToday)} onClick={() => preset(today, today)}>
          {t('today')}
        </button>
        <button type="button" className={chip(isMonth)} onClick={() => preset(monthStartISO(), today)}>
          {t('thisMonth')}
        </button>
        <button type="button" className={chip(isFy)} onClick={() => preset(fyStartISO(fy), fyEndISO(fy))}>
          FY {fy}-{String((fy + 1) % 100).padStart(2, '0')}
        </button>
        <button type="button" className={chip(isAll)} onClick={() => preset('', '')}>
          {t('allTime')}
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[10px] uppercase text-[var(--text-muted)]">{t('dateFrom')}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => onChange(e.target.value, to)}
            className="w-full min-h-11 rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 text-base sm:text-sm"
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[10px] uppercase text-[var(--text-muted)]">{t('dateTo')}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onChange(from, e.target.value)}
            className="w-full min-h-11 rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 text-base sm:text-sm"
          />
        </label>
      </div>
    </div>
  );
}
