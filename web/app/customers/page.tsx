'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { useDashboard } from '../components/useDashboard';
import AgingBadge from '../components/AgingBadge';
import { Card, SectionHeader, Button, EmptyState, ListSkeleton, PageHeader, Badge } from '../components/ui';
import { UsersIcon, SearchIcon, DownloadIcon, MessageIcon, PrinterIcon, XIcon, DollarIcon } from '../components/Icons';
import { fmt } from '@/lib/format';
import { computeAging, customersCsv, downloadCsv, reminderText, statementText, waLink } from '@/lib/statement';
import { printCreditLedger, CreditLedgerEntry, ShopProfile } from '@/lib/billPrint';
import { OverdueCustomer } from '@/lib/types';
import { generateOutstandingListPdf, generateCreditLedgerPdf, generateBillsPdf, printPdfBlob } from '@/lib/pdfShare';
import { txnToBillData } from '@/lib/billPrint';

export default function CustomersPage() {
  const { t, lang } = useI18n();
  const [fyParam, setFyParam] = useState<number | 'all' | null>(null);
  const { customers, loading } = useDashboard(fyParam === 'all' ? null : fyParam);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'due' | 'name' | 'oldest'>('due');
  const [shopSettings, setShopSettings] = useState<ShopProfile>({});
  const [overdue, setOverdue] = useState<OverdueCustomer[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState<'idle' | 'generating' | 'sharing'>('idle');

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

  const sendBatchReminders = () => {
    setShowBatch(true);
    loadOverdue();
  };

  const sendReminder = (c: OverdueCustomer) => {
    const dn = formatCustomerName(c, uiLang);
    const msg = `Namaste ${dn},\n\nPending amount at ${shopSettings.shopName || 'RVC'}: ${fmt(c.due)}.\nOldest unpaid bill: ${c.oldestDate} (${c.oldestDays} days).\n\nPlease arrange the payment. Thank you.`;
    const link = waLink(msg, c.phone);
    window.open(link, '_blank');
  };

  const shareStatement = (c: typeof customers[number]) => {
    const dn = formatCustomerName(c, uiLang);
    const msg = statementText(c, shopSettings.shopName || 'RVC', dn);
    const link = waLink(msg, c.phone);
    window.open(link, '_blank');
  };

  // Generate the PDF blob for a given format (used by both print and share)
  const generateLedgerPdf = (format: 'outstanding' | 'creditLedger' | 'patti'): { blob: Blob; filename: string } => {
    const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');

    if (format === 'outstanding') {
      return {
        blob: generateOutstandingListPdf(customers, shopSettings, uiLang),
        filename: `outstanding-list-${dateStr}.pdf`,
      };
    } else if (format === 'creditLedger') {
      const entries: CreditLedgerEntry[] = customers
        .filter((c) => c.due > 0)
        .sort((a, b) => formatCustomerName(a, uiLang).localeCompare(formatCustomerName(b, uiLang)))
        .map((c, i) => ({
          code: String(i + 1),
          name: formatCustomerName(c, uiLang),
          phone: c.phone || undefined,
          amount: Math.round(c.due),
          isCredit: false,
        }));
      return {
        blob: generateCreditLedgerPdf(entries, shopSettings, dateStr, 'All'),
        filename: `credit-ledger-${dateStr}.pdf`,
      };
    } else {
      const allBills = customers.flatMap((c) =>
        c.txns.filter((tx) => tx.type === 'bill').map((tx) => txnToBillData(tx, formatCustomerName(c, uiLang)))
      );
      if (allBills.length === 0) {
        throw new Error('No bills found');
      }
      return {
        blob: generateBillsPdf(allBills, shopSettings, 'patti'),
        filename: `all-bills-patti-${dateStr}.pdf`,
      };
    }
  };

  const printLedgerFormat = (format: 'outstanding' | 'creditLedger' | 'patti') => {
    setShowLedgerMenu(false);
    try {
      const { blob } = generateLedgerPdf(format);
      printPdfBlob(blob);
    } catch (err: any) {
      alert(err.message || 'Failed to generate PDF');
    }
  };

  const shareLedgerFormat = async (format: 'outstanding' | 'creditLedger' | 'patti') => {
    setShowLedgerMenu(false);
    try {
      const { blob, filename } = generateLedgerPdf(format);
      const shareText = `${shopSettings.shopName || 'RVC'} — Customer Outstanding List`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Use native share sheet on all platforms (mobile + desktop)
      // On macOS this opens the share sheet with AirDrop, Messages, Mail, etc.
      // If WhatsApp desktop app is installed, it appears as a share target
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        setLedgerStatus('sharing');
        navigator.share({ files: [file], title: filename, text: shareText })
          .then(() => setLedgerStatus('idle'))
          .catch(() => setLedgerStatus('idle'));
        return;
      }

      // Fallback: download the PDF
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setLedgerStatus('idle');
    } catch (err: any) {
      alert(err.message || 'Failed to generate PDF');
      setLedgerStatus('idle');
    }
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

  const uiLang = getUiLang(lang);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? customers.filter((c) => {
          const ln = formatCustomerName(c, uiLang).toLowerCase();
          return ln.includes(needle) || c.name.toLowerCase().includes(needle);
        })
      : customers;
    const withAging = filtered.map((c) => ({ c, aging: computeAging(c.txns) }));
    return withAging.sort((a, b) => {
      if (sort === 'name') return formatCustomerName(a.c, uiLang).localeCompare(formatCustomerName(b.c, uiLang));
      if (sort === 'oldest') return b.aging.oldestDays - a.aging.oldestDays;
      return b.c.due - a.c.due;
    });
  }, [customers, q, sort, uiLang]);

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

  // FY label
  const now = new Date();
  const currentFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('navCustomers')}
        subtitle={`${customers.length} ${t('customersCount')} · ${overdueCount} ${t('overdue')} · ${fmt(totalDue)} ${t('due')}`}
      />

      {/* FY selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">{t('financialYear')}:</span>
        {[
          { key: null, label: `FY ${currentFY}-${String((currentFY + 1) % 100).padStart(2, '0')}` },
          { key: currentFY - 1, label: `FY ${currentFY - 1}-${String(currentFY % 100).padStart(2, '0')}` },
          { key: 'all' as const, label: t('allTime') },
        ].map((opt) => (
          <button
            key={String(opt.key)}
            onClick={() => setFyParam(opt.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              fyParam === opt.key
                ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                : 'border border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-base)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

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
        <span className="relative">
          <Button variant="primary" size="sm" onClick={() => setShowLedgerMenu((v) => !v)} disabled={overdueCount === 0 || ledgerStatus !== 'idle'}>
            <span className="flex items-center gap-1.5">
              <PrinterIcon size={14} /> {ledgerStatus === 'generating' ? 'Generating…' : ledgerStatus === 'sharing' ? 'Sharing…' : t('ledger')} ▾
            </span>
          </Button>
          {showLedgerMenu && (
            <span className="absolute left-0 top-9 z-10 w-64 rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
              <div className="px-2 py-1.5">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Mandi Ledger</p>
                <div className="mt-1 flex gap-1">
                  <button onClick={() => printLedgerFormat('creditLedger')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                    🖨 Print
                  </button>
                  <button onClick={() => shareLedgerFormat('creditLedger')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                    📤 Share
                  </button>
                </div>
              </div>
              <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Dues Summary</p>
                <div className="mt-1 flex gap-1">
                  <button onClick={() => printLedgerFormat('outstanding')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                    🖨 Print
                  </button>
                  <button onClick={() => shareLedgerFormat('outstanding')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                    📤 Share
                  </button>
                </div>
              </div>
              <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Compact Bills (6 per page)</p>
                <div className="mt-1 flex gap-1">
                  <button onClick={() => printLedgerFormat('patti')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                    🖨 Print
                  </button>
                  <button onClick={() => shareLedgerFormat('patti')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                    📤 Share
                  </button>
                </div>
              </div>
            </span>
          )}
        </span>
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
                      <p className="truncate text-sm font-medium">{formatCustomerName(c, uiLang)}</p>
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
            description={q ? 'Try a different search term.' : 'Add customers by recording sales.'}
            action={q ? undefined : { label: t('sell'), href: '/sell' }}
          />
        </Card>
      ) : (
        <Card padding="p-0">
          <ul className="divide-y divide-[var(--border-light)]">
            {list.map(({ c, aging }) => (
              <li key={c.id} className="group">
                <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {formatCustomerName(c, uiLang)}
                      <AgingBadge aging={aging} />
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {t('billed')} {fmt(c.billed)} · {t('paid')} {fmt(c.paid)}
                    </p>
                  </Link>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold ${c.due > 0 ? 'text-[var(--bg-primary)]' : 'text-[var(--text-faint)]'}`}>
                      {fmt(c.due)}
                    </p>
                    {c.due > 0 && <p className="text-[10px] text-[var(--text-faint)]">{t('due')}</p>}
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareStatement(c); }}
                    title={t('shareStatement')}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-on-primary)] transition-colors"
                    aria-label={t('shareStatement')}
                  >
                    <MessageIcon size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
