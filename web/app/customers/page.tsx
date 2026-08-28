'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { useDashboard } from '../components/useDashboard';
import AgingBadge from '../components/AgingBadge';
import { Card, SectionHeader, Button, EmptyState, ListSkeleton, PageHeader, Badge } from '../components/ui';
import { UsersIcon, SearchIcon, DownloadIcon, MessageIcon, PrinterIcon, XIcon, DollarIcon } from '../components/Icons';
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
    return (
      <div className="space-y-4">
        <PageHeader title={t('navCustomers')} />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  const totalDue = customers.reduce((s, c) => s + c.due, 0);
  const overdueCount = customers.filter((c) => c.due > 0).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('navCustomers')}
        subtitle={`${customers.length} ${t('customersCount')} · ${overdueCount} ${t('overdue')} · ${fmt(totalDue)} ${t('due')}`}
      />

      {/* Action bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchCustomers')}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'due' | 'name' | 'oldest')}
          className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
        >
          <option value="due">{t('sortDue')}</option>
          <option value="oldest">{t('overdue')}</option>
          <option value="name">{t('sortName')}</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => downloadCsv('rvc-customers.csv', customersCsv(customers))}>
          <span className="flex items-center gap-1.5"><DownloadIcon size={14} /> {t('exportCsv')}</span>
        </Button>
        <Button variant="secondary" size="sm" onClick={sendBatchReminders}>
          <span className="flex items-center gap-1.5"><MessageIcon size={14} /> {t('batchReminders')}</span>
        </Button>
        <Button variant="primary" size="sm" onClick={printLedger} disabled={overdueCount === 0}>
          <span className="flex items-center gap-1.5"><PrinterIcon size={14} /> {t('printCreditLedger')}</span>
        </Button>
      </div>

      {/* Batch reminders panel */}
      {showBatch && (
        <Card>
          <SectionHeader
            title={`${t('batchReminders')} (${overdue.length})`}
            icon={<MessageIcon size={16} />}
            action={
              <button onClick={() => setShowBatch(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <XIcon size={16} />
              </button>
            }
          />
          {batchLoading ? (
            <div className="space-y-2">
              {[1,2,3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--bg-card-hover)]" />)}
            </div>
          ) : overdue.length === 0 ? (
            <EmptyState icon={<MessageIcon size={40} />} title={t('noOverdue')} />
          ) : (
            <>
              <Button variant="success" size="sm" className="mb-3" onClick={sendAllReminders}>
                <span className="flex items-center gap-1.5"><MessageIcon size={14} /> {t('sendAllWithPhone')}</span>
              </Button>
              <ul className="divide-y divide-[var(--border-light)]">
                {overdue.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {fmt(c.due)} · {c.oldestDays}d · {c.phone || t('noPhone')}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => sendReminder(c)}
                      disabled={!c.phone}
                    >
                      WhatsApp
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {/* Customer list */}
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon size={48} />}
            title={q ? t('noCustomers') : t('noCustomers')}
            description={q ? 'Try a different search term.' : 'Add customers by creating bills or uploading bills.'}
            action={q ? undefined : { label: t('quickBill'), href: '/quick-bill' }}
          />
        </Card>
      ) : (
        <Card padding="p-0">
          <ul className="divide-y divide-[var(--border-light)]">
            {list.map(({ c, aging }) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {c.name}
                      <AgingBadge aging={aging} />
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {t('billed')} {fmt(c.billed)} · {t('paid')} {fmt(c.paid)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold ${c.due > 0 ? 'text-[var(--bg-primary)]' : 'text-[var(--text-faint)]'}`}>
                      {fmt(c.due)}
                    </p>
                    {c.due > 0 && <p className="text-[10px] text-[var(--text-faint)]">{t('due')}</p>}
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
