'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { useDashboard } from '../components/useDashboard';
import { usePersistentState } from '../components/usePersistentState';
import AgingBadge from '../components/AgingBadge';
import { Card, SectionHeader, Button, EmptyState, ListSkeleton, PageHeader, Badge } from '../components/ui';
import { UsersIcon, SearchIcon, DownloadIcon, MessageIcon, PrinterIcon, XIcon, DollarIcon } from '../components/Icons';
import { fmt } from '@/lib/format';
import { computeAging, customersCsv, downloadCsv, reminderText, statementText, waLink } from '@/lib/statement';
import { printCreditLedger, CreditLedgerEntry, ShopProfile } from '@/lib/billPrint';
import { OverdueCustomer } from '@/lib/types';
import { generateOutstandingListPdf, generateCreditLedgerPdf, generateBillsPdf, generateStatementPdf, printPdfBlob } from '@/lib/pdfShare';
import { txnToBillData } from '@/lib/billPrint';
import DateRangeBar from '../components/DateRangeBar';
import { fyStartISO, fyEndISO, currentFyStartYear, sliceCustomer, rangeLabel } from '@/lib/dateRange';

export default function CustomersPage() {
  const { t, lang } = useI18n();
  const [fyParam, setFyParam] = useState<number | 'all' | null>(null);
  const { customers, loading } = useDashboard(fyParam === 'all' ? null : fyParam);
  const [q, setQ] = useState('');
  const [sort, setSort] = usePersistentState<'due' | 'name' | 'oldest' | 'recent'>('customers-sort', 'due');
  const [viewMode, setViewMode] = usePersistentState<'customers' | 'recent'>('customers-view', 'customers');
  const [shopSettings, setShopSettings] = useState<ShopProfile>({});
  const [overdue, setOverdue] = useState<OverdueCustomer[]>([]);
  const [showBatch, setShowBatch] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState<'idle' | 'generating' | 'sharing'>('idle');
  const [openCustomerMenu, setOpenCustomerMenu] = useState<string | null>(null);
  const fyYear = currentFyStartYear();
  const [from, setFrom] = useState(fyStartISO(fyYear));
  const [to, setTo] = useState(fyEndISO(fyYear));

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setShopSettings(d.settings || {}))
      .catch(() => {});
  }, []);

  // Close customer dropdown when clicking outside
  useEffect(() => {
    if (!openCustomerMenu) return;
    const handler = () => setOpenCustomerMenu(null);
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [openCustomerMenu]);

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

  const shareStatement = async (c: typeof customers[number]) => {
    const dn = formatCustomerName(c, uiLang);
    const msg = statementText(c, shopSettings.shopName || 'RVC', dn);

    // Generate statement PDF
    const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    const blob = generateStatementPdf(c, shopSettings as any, dn);
    const filename = `${dn.replace(/\s+/g, '-')}-statement-${dateStr}.pdf`;
    const file = new File([blob], filename, { type: 'application/pdf' });

    // Use native share sheet on mobile AND Windows desktop
    // Windows 11 shows WhatsApp in the share menu and supports file attachment
    const isMac = /Mac/i.test(navigator.userAgent) && !/Mobile|iPhone|iPad/i.test(navigator.userAgent);
    const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

    if (canShareFiles && !isMac) {
      navigator.share({ files: [file], title: filename, text: msg }).catch(() => {});
      return;
    }

    // macOS desktop fallback: upload PDF, open WhatsApp Web with link
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('title', `${shopSettings.shopName || 'RVC'} — ${dn}`);
      const res = await fetch('/api/pdf', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { id } = await res.json();
      const pdfLink = `${window.location.origin}/pdf/${id}`;
      const fullMsg = `${msg}\n\nView PDF: ${pdfLink}`;
      window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(fullMsg)}`, '_blank');
    } catch {
      // Fallback: just send text via wa.me
      window.open(waLink(msg, c.phone), '_blank');
    }
  };

  // Per-customer PDF generation (statement, credit ledger, bills)
  const generateCustomerPdf = (c: typeof customers[number], format: 'statement' | 'creditLedger' | 'patti'): { blob: Blob; filename: string } => {
    const sliced = sliceCustomer(c, from, to);
    const dn = formatCustomerName(c, uiLang);
    const dateStr = rangeLabel(from, to);
    if (format === 'statement') {
      return {
        blob: generateStatementPdf(sliced, shopSettings as any, dn),
        filename: `${dn.replace(/\s+/g, '-')}-statement-${dateStr}.pdf`,
      };
    } else if (format === 'creditLedger') {
      const entries: CreditLedgerEntry[] = [{
        code: '1',
        name: dn,
        phone: c.phone || undefined,
        amount: Math.round(sliced.due),
        isCredit: false,
      }];
      return {
        blob: generateCreditLedgerPdf(entries, shopSettings as any, dateStr, dn),
        filename: `${dn.replace(/\s+/g, '-')}-credit-ledger-${dateStr}.pdf`,
      };
    } else {
      const bills = sliced.txns.filter((tx) => tx.type === 'bill');
      if (bills.length === 0) throw new Error('No bills found for this customer in this date range');
      const billData = bills.map((b) => txnToBillData(b, dn));
      return {
        blob: generateBillsPdf(billData, shopSettings as any, 'patti'),
        filename: `${dn.replace(/\s+/g, '-')}-bills-${dateStr}.pdf`,
      };
    }
  };

  const printCustomerPdf = (c: typeof customers[number], format: 'statement' | 'creditLedger' | 'patti') => {
    setOpenCustomerMenu(null);
    try {
      const { blob } = generateCustomerPdf(c, format);
      printPdfBlob(blob);
    } catch (err: any) {
      alert(err.message || 'Failed to generate PDF');
    }
  };

  const shareCustomerPdf = async (c: typeof customers[number], format: 'statement' | 'creditLedger' | 'patti') => {
    setOpenCustomerMenu(null);
    try {
      const { blob, filename } = generateCustomerPdf(c, format);
      const dn = formatCustomerName(c, uiLang);
      const shareText = `${shopSettings.shopName || 'RVC'} — ${dn}`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Windows + mobile: native share sheet with file attachment
      const isMac = /Mac/i.test(navigator.userAgent) && !/Mobile|iPhone|iPad/i.test(navigator.userAgent);
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

      if (canShareFiles && !isMac) {
        navigator.share({ files: [file], title: filename, text: shareText }).catch(() => {});
        return;
      }

      // macOS: upload PDF, open WhatsApp Web with link
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('title', shareText);
      const res = await fetch('/api/pdf', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { id } = await res.json();
      const pdfLink = `${window.location.origin}/pdf/${id}`;
      const waText = `${shareText}\n\nView PDF: ${pdfLink}`;
      window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');
    } catch (err: any) {
      alert(err.message || 'Failed to share PDF');
    }
  };

  const sendCustomerReminder = (c: typeof customers[number]) => {
    setOpenCustomerMenu(null);
    const dn = formatCustomerName(c, uiLang);
    const msg = reminderText(c, shopSettings.shopName || 'RVC', dn);
    window.open(waLink(msg, c.phone), '_blank');
  };

  // Generate the PDF blob for a given format (used by both print and share)
  const generateLedgerPdf = (format: 'outstanding' | 'creditLedger' | 'patti'): { blob: Blob; filename: string } => {
    const dateStr = rangeLabel(from, to);
    const sliced = customers.map((c) => sliceCustomer(c, from, to));

    if (format === 'outstanding') {
      return {
        blob: generateOutstandingListPdf(sliced, shopSettings, uiLang, dateStr),
        filename: `outstanding-list-${dateStr}.pdf`,
      };
    } else if (format === 'creditLedger') {
      const entries: CreditLedgerEntry[] = sliced
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
      const allBills = sliced.flatMap((c) =>
        c.txns.filter((tx) => tx.type === 'bill').map((tx) => txnToBillData(tx, formatCustomerName(c, uiLang)))
      );
      if (allBills.length === 0) {
        throw new Error('No bills found in this date range');
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
    setLedgerStatus('generating');
    try {
      const { blob, filename } = generateLedgerPdf(format);
      const shareText = `${shopSettings.shopName || 'RVC'} — Dues List`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Use native share sheet on mobile AND Windows desktop
      // Windows 11 shows WhatsApp in the share menu and supports file attachment
      // macOS doesn't show WhatsApp in the share menu, so we use link approach
      const isMac = /Mac/i.test(navigator.userAgent) && !/Mobile|iPhone|iPad/i.test(navigator.userAgent);
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

      if (canShareFiles && !isMac) {
        setLedgerStatus('sharing');
        navigator.share({ files: [file], title: filename, text: shareText })
          .then(() => setLedgerStatus('idle'))
          .catch(() => setLedgerStatus('idle'));
        return;
      }

      // macOS desktop fallback: upload PDF, open WhatsApp desktop app with link
      setLedgerStatus('sharing');
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('title', shareText);

      const res = await fetch('/api/pdf', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to upload PDF');
      const { id } = await res.json();

      const baseUrl = window.location.origin;
      const pdfLink = `${baseUrl}/pdf/${id}`;
      const waText = `${shareText}\n\nView PDF: ${pdfLink}`;

      // Open WhatsApp Web in browser with the link
      window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');

      // Also download as backup
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
      if (sort === 'recent') {
        const aLatest = a.c.txns.length ? a.c.txns.reduce((mx, tx) => tx.date > mx ? tx.date : mx, a.c.txns[0].date) : '';
        const bLatest = b.c.txns.length ? b.c.txns.reduce((mx, tx) => tx.date > mx ? tx.date : mx, b.c.txns[0].date) : '';
        return bLatest.localeCompare(aLatest);
      }
      return b.c.due - a.c.due;
    });
  }, [customers, q, sort, uiLang]);

  // Recent transactions across all customers
  const recentTxns = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = customers.flatMap((c) =>
      c.txns.map((tx) => ({
        txn: tx,
        customer: c,
        displayName: formatCustomerName(c, uiLang),
      }))
    );
    const filtered = needle
      ? all.filter(({ txn, displayName, customer }) => {
          const itemMatch = txn.items?.some((it) =>
            (it.name || it.display || '').toLowerCase().includes(needle)
          );
          return (
            displayName.toLowerCase().includes(needle) ||
            customer.name.toLowerCase().includes(needle) ||
            itemMatch
          );
        })
      : all;
    return filtered.sort((a, b) => b.txn.date.localeCompare(a.txn.date));
  }, [customers, q, uiLang]);

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

      <DateRangeBar from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />

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
            className="w-full min-h-11 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] pl-9 pr-3 py-2 text-base sm:text-sm"
          />
        </div>
        <div className="flex rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-0.5">
          <button
            onClick={() => setViewMode('customers')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'customers' ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            Customers
          </button>
          <button
            onClick={() => setViewMode('recent')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'recent' ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            Recent
          </button>
        </div>
        {viewMode === 'customers' && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'due' | 'name' | 'oldest' | 'recent')}
            className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
          >
            <option value="due">{t('sortDue')}</option>
            <option value="oldest">{t('overdue')}</option>
            <option value="name">{t('sortName')}</option>
            <option value="recent">Recent</option>
          </select>
        )}
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
              <PrinterIcon size={14} /> {ledgerStatus === 'generating' ? 'Generating…' : ledgerStatus === 'sharing' ? 'Sharing…' : 'Print / Share'} ▾
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
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Dues List</p>
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
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Customer Bill (6 per page)</p>
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
      {viewMode === 'customers' && (list.length === 0 ? (
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
                  <span className="relative shrink-0">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenCustomerMenu(openCustomerMenu === c.id ? null : c.id); }}
                      title="Print & Share"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-on-primary)] transition-colors"
                      aria-label="Print & Share"
                    >
                      <MessageIcon size={16} />
                    </button>
                    {openCustomerMenu === c.id && (
                      <span className="absolute right-0 top-9 z-20 w-56 rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                        <div className="px-2 py-1.5">
                          <p className="text-xs font-semibold text-[var(--text-secondary)]">Statement</p>
                          <div className="mt-1 flex gap-1">
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); printCustomerPdf(c, 'statement'); }} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">🖨 Print</button>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareCustomerPdf(c, 'statement'); }} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">📤 Share</button>
                          </div>
                        </div>
                        {c.due > 0 && (
                          <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                            <p className="text-xs font-semibold text-[var(--text-secondary)]">Mandi Ledger</p>
                            <div className="mt-1 flex gap-1">
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); printCustomerPdf(c, 'creditLedger'); }} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">🖨 Print</button>
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareCustomerPdf(c, 'creditLedger'); }} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">📤 Share</button>
                            </div>
                          </div>
                        )}
                        <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                          <p className="text-xs font-semibold text-[var(--text-secondary)]">Customer Bill</p>
                          <div className="mt-1 flex gap-1">
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); printCustomerPdf(c, 'patti'); }} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">🖨 Print</button>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareCustomerPdf(c, 'patti'); }} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">📤 Share</button>
                          </div>
                        </div>
                        {c.due > 0 && (
                          <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); sendCustomerReminder(c); }} className="w-full rounded-md bg-[var(--bg-success)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-success-hover)]">💬 Send Reminder</button>
                          </div>
                        )}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {/* Recent transactions view */}
      {viewMode === 'recent' && (
        recentTxns.length === 0 ? (
          <Card>
            <EmptyState
              icon={<UsersIcon size={48} />}
              title="No transactions yet"
              description={q ? 'Try a different search term.' : 'Record sales on the Sell page to see transactions here.'}
              action={q ? undefined : { label: t('sell'), href: '/sell' }}
            />
          </Card>
        ) : (
          <Card padding="p-0">
            <div className="border-b border-[var(--border-light)] px-4 py-2.5">
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                {recentTxns.length} transactions · sorted by date (newest first)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-light)] text-left text-xs text-[var(--text-muted)]">
                    <th className="px-4 py-2 pr-2">Date</th>
                    <th className="px-2 py-2 pr-2">Item</th>
                    <th className="px-2 py-2 pr-2">Buyer</th>
                    <th className="px-2 py-2 pr-2 text-right">Bags</th>
                    <th className="px-2 py-2 pr-2 text-right">Qty</th>
                    <th className="px-2 py-2 pr-2 text-right">Rate</th>
                    <th className="px-2 py-2 pr-2 text-right">Amount</th>
                    <th className="px-2 py-2 pr-2">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTxns.map(({ txn, customer, displayName }) => {
                    const items = txn.items || [];
                    const isCash = customer.name === 'CASH SALES';
                    return items.length > 0 ? items.map((it, i) => (
                      <tr key={`${txn.id}-${i}`} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-card-hover)] transition-colors">
                        {i === 0 ? (
                          <td className="px-4 py-2 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap" rowSpan={items.length}>
                            {txn.date}
                          </td>
                        ) : null}
                        <td className="px-2 py-2 pr-2">{it.name || it.display || '—'}</td>
                        {i === 0 ? (
                          <td className="px-2 py-2 pr-2" rowSpan={items.length}>
                            <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                              {displayName}
                            </Link>
                          </td>
                        ) : null}
                        <td className="px-2 py-2 pr-2 text-right text-xs">{it.bags || '—'}</td>
                        <td className="px-2 py-2 pr-2 text-right text-xs">{it.qty || '—'}</td>
                        <td className="px-2 py-2 pr-2 text-right text-xs">{it.rate || '—'}</td>
                        <td className="px-2 py-2 pr-2 text-right font-medium">{fmt(Number(it.amount) || 0)}</td>
                        {i === 0 ? (
                          <td className="px-2 py-2 pr-2" rowSpan={items.length}>
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${isCash ? 'bg-[var(--bg-card-hover)] text-[var(--text-muted)]' : 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'}`}>
                              {isCash ? 'Cash' : 'Credit'}
                            </span>
                          </td>
                        ) : null}
                      </tr>
                    )) : (
                      <tr key={txn.id} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-card-hover)] transition-colors">
                        <td className="px-4 py-2 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap">{txn.date}</td>
                        <td className="px-2 py-2 pr-2 text-[var(--text-muted)]">—</td>
                        <td className="px-2 py-2 pr-2">
                          <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                            {displayName}
                          </Link>
                        </td>
                        <td className="px-2 py-2 pr-2 text-right text-xs">—</td>
                        <td className="px-2 py-2 pr-2 text-right text-xs">—</td>
                        <td className="px-2 py-2 pr-2 text-right text-xs">—</td>
                        <td className="px-2 py-2 pr-2 text-right font-medium">{fmt(txn.amount)}</td>
                        <td className="px-2 py-2 pr-2">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${txn.type === 'payment' ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : isCash ? 'bg-[var(--bg-card-hover)] text-[var(--text-muted)]' : 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'}`}>
                            {txn.type === 'payment' ? 'Payment' : isCash ? 'Cash' : 'Credit'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}
    </div>
  );
}
