'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { useDashboard } from '../components/useDashboard';
import AgingBadge from '../components/AgingBadge';
import { fmt } from '@/lib/format';
import { computeAging, customersCsv, downloadCsv, reminderText, waLink } from '@/lib/statement';
import { printCreditLedger, CreditLedgerEntry, ShopProfile } from '@/lib/billPrint';
import { OverdueCustomer } from '@/lib/types';

export default function CustomersPage() {
  const { t } = useI18n();
  const { customers, loading } = useDashboard();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'due' | 'name' | 'oldest'>('due');
  const [shopSettings, setShopSettings] = useState<ShopProfile>({});
  const [overdue, setOverdue] = useState<OverdueCustomer[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setShopSettings(d.settings || {}))
      .catch(() => {});
  }, []);

  const loadOverdue = () => {
    setBatchLoading(true);
    fetch('/api/overdue?minDays=1')
      .then((r) => r.json())
      .then((d) => setOverdue(d.overdue || []))
      .catch(() => setOverdue([]))
      .finally(() => setBatchLoading(false));
  };

  const printLedger = () => {
    const entries: CreditLedgerEntry[] = customers
      .filter((c) => c.due > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c, i) => ({
        code: String(i + 1),
        name: c.name,
        phone: c.phone || undefined,
        amount: Math.round(c.due),
        isCredit: false,
      }));
    printCreditLedger(entries, shopSettings, undefined, 'All');
  };

  const sendBatchReminders = () => {
    setShowBatch(true);
    loadOverdue();
  };

  const sendReminder = (c: OverdueCustomer) => {
    const msg = `Namaste ${c.name},\n\nPending amount at ${shopSettings.shopName || 'RVC'}: ${fmt(c.due)}.\nOldest unpaid bill: ${c.oldestDate} (${c.oldestDays} days).\n\nPlease arrange the payment. Thank you.`;
    const link = waLink(msg, c.phone);
    window.open(link, '_blank');
  };

  const sendAllReminders = () => {
    // Open WhatsApp for each overdue customer with a phone number
    let count = 0;
    for (const c of overdue) {
      if (c.phone) {
        setTimeout(() => sendReminder(c), count * 500);
        count++;
      }
    }
    if (count === 0) {
      alert(t('noPhonesForReminders'));
    }
  };

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
          <button
            onClick={sendBatchReminders}
            className="rounded-md bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]"
          >
            {t('batchReminders')}
          </button>
          <button
            onClick={printLedger}
            disabled={customers.filter((c) => c.due > 0).length === 0}
            className="rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {t('printCreditLedger')}
          </button>
        </div>
      </div>

      {/* Batch reminders panel */}
      {showBatch && (
        <section className="rounded-lg bg-[var(--bg-card)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('batchReminders')} ({overdue.length})</h2>
            <button
              onClick={() => setShowBatch(false)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
          {batchLoading ? (
            <p className="text-sm text-[var(--text-faint)]">{t('loading')}</p>
          ) : overdue.length === 0 ? (
            <p className="text-sm text-[var(--text-faint)]">{t('noOverdue')}</p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  onClick={sendAllReminders}
                  className="rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]"
                >
                  {t('sendAllWithPhone')}
                </button>
              </div>
              <ul className="divide-y divide-[var(--border-light)]">
                {overdue.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {fmt(c.due)} · {c.oldestDays}d · {c.phone || t('noPhone')}
                      </p>
                    </div>
                    <button
                      onClick={() => sendReminder(c)}
                      disabled={!c.phone}
                      className="shrink-0 rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-on-primary)] disabled:opacity-40"
                    >
                      WhatsApp
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

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
