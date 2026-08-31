'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { TxnView } from '@/lib/types';
import Link from 'next/link';
import { useI18n } from '../../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { useDashboard } from '../../components/useDashboard';
import TxnCard from '../../components/TxnCard';
import LedgerTable from '../../components/LedgerTable';
import AgingBadge from '../../components/AgingBadge';
import { Card, SectionHeader, StatCard, Button, EmptyState, PageHeader } from '../../components/ui';
import { ArrowLeftIcon, MessageIcon, DownloadIcon, PrinterIcon, PhoneIcon, DollarIcon, CheckIcon, UsersIcon } from '../../components/Icons';
import { fmt, fmtDate } from '@/lib/format';
import {
  computeAging,
  customerCsv,
  downloadCsv,
  reminderText,
  statementText,
  waLink,
} from '@/lib/statement';
import { printBill, printBills, printCreditLedger, txnToBillData, CreditLedgerEntry } from '@/lib/billPrint';
import { generateStatementPdf, generateOutstandingListPdf, generateCreditLedgerPdf, generateBillsPdf, sharePdfViaWhatsApp, printPdfBlob } from '@/lib/pdfShare';

export default function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useI18n();
  const { customers, loading } = useDashboard();
  const customer = useMemo(() => customers.find((c) => c.id === id), [customers, id]);

  const [phone, setPhone] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [copied, setCopied] = useState(false);
  const [creditLimit, setCreditLimit] = useState('');
  const [creditStatus, setCreditStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [shopSettings, setShopSettings] = useState<{ shopName?: string; shopAddress?: string; shopPhone?: string; billFormat?: string }>({});
  const [showPdfFormats, setShowPdfFormats] = useState(false);
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState<'idle' | 'generating' | 'sharing'>('idle');

  // Date range filter
  type RangePreset = 'all' | 'today' | 'month' | 'fy' | 'custom';
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Financial year: April 1 to March 31. If current month is Jan-Mar, we're in FY that started last year.
  // e.g. Feb 2026 → FY 2025-26 (April 2025 to March 2026)
  //      June 2026 → FY 2026-27 (April 2026 to March 2027)
  const now = new Date();
  const currentFYStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [fyOffset, setFyOffset] = useState(0); // 0 = current FY, -1 = previous, -2 = two years ago
  const fyStartYear = currentFYStartYear + fyOffset;
  const fyLabel = `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
  const fyFrom = `${fyStartYear}-04-01`;
  const fyTo = `${fyStartYear + 1}-03-31`;

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const monthStart = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const effectiveFrom = rangePreset === 'today' ? todayStr()
    : rangePreset === 'month' ? monthStart()
    : rangePreset === 'fy' ? fyFrom
    : rangePreset === 'custom' ? fromDate
    : '';
  const effectiveTo = rangePreset === 'fy' ? fyTo : rangePreset === 'custom' ? toDate : '';

  // Filter txns by date range
  const filteredTxns: TxnView[] = useMemo(() => {
    if (!customer) return [];
    return customer.txns.filter((tx) => {
      if (effectiveFrom && tx.date < effectiveFrom) return false;
      if (effectiveTo && tx.date > effectiveTo) return false;
      return true;
    });
  }, [customer, effectiveFrom, effectiveTo]);

  // Opening balance = sum of all txns before the from-date
  const openingBalance = useMemo(() => {
    if (!customer || !effectiveFrom) return 0;
    return customer.txns
      .filter((tx) => tx.date < effectiveFrom)
      .reduce((bal, tx) => bal + (tx.type === 'bill' ? tx.amount : -tx.amount), 0);
  }, [customer, effectiveFrom]);

  // Filtered totals
  const filteredBilled = filteredTxns.filter((tx) => tx.type === 'bill').reduce((s, tx) => s + tx.amount, 0);
  const filteredPaid = filteredTxns.filter((tx) => tx.type === 'payment').reduce((s, tx) => s + tx.amount, 0);
  const closingBalance = openingBalance + filteredBilled - filteredPaid;

  useEffect(() => {
    if (customer?.phone) setPhone(customer.phone);
    if (customer?.creditLimit) setCreditLimit(String(customer.creditLimit));
  }, [customer?.phone, customer?.creditLimit]);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setShopSettings(d.settings || {}))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 animate-pulse rounded bg-[var(--bg-card-hover)]" />
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--bg-card-hover)]" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-card)]" />)}
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <Card>
        <EmptyState
          icon={<UsersIcon size={48} />}
          title={t('noCustomers')}
          action={{ label: t('allCustomers'), href: '/customers' }}
        />
      </Card>
    );
  }

  const bills = customer.txns.filter((x) => x.type === 'bill').length;
  const payments = customer.txns.filter((x) => x.type === 'payment').length;
  const aging = computeAging(customer.txns);
  const uiLang = getUiLang(lang);
  const displayName = formatCustomerName(customer, uiLang);

  const savePhone = async () => {
    setPhoneStatus('saving');
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error('save failed');
      setPhoneStatus('saved');
      setTimeout(() => setPhoneStatus('idle'), 1500);
    } catch {
      setPhoneStatus('idle');
    }
  };

  const copyStatement = async () => {
    try {
      await navigator.clipboard.writeText(statementText(customer, shopSettings.shopName || 'RVC', displayName));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const saveCreditLimit = async () => {
    setCreditStatus('saving');
    try {
      const res = await fetch('/api/credit-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customer.id, limit: creditLimit ? Number(creditLimit) : null }),
      });
      if (!res.ok) throw new Error('save failed');
      setCreditStatus('saved');
      setTimeout(() => setCreditStatus('idle'), 1500);
    } catch {
      setCreditStatus('idle');
    }
  };

  // Generate the PDF blob for a given format (used by both print and share)
  const generateLedgerPdf = (format: 'statement' | 'simple' | 'itemized' | 'creditLedger' | 'patti'): { blob: Blob; filename: string } => {
    const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');

    if (format === 'statement') {
      return {
        blob: generateStatementPdf(customer, shopSettings as any, displayName),
        filename: `${displayName.replace(/\s+/g, '-')}-statement-${dateStr}.pdf`,
      };
    } else if (format === 'creditLedger') {
      if (customer.due <= 0) {
        throw new Error('This customer has no outstanding balance');
      }
      const entries: CreditLedgerEntry[] = [{
        code: '1',
        name: displayName,
        phone: customer.phone || undefined,
        amount: Math.round(customer.due),
        isCredit: false,
      }];
      return {
        blob: generateCreditLedgerPdf(entries, shopSettings as any, dateStr, displayName),
        filename: `${displayName.replace(/\s+/g, '-')}-credit-ledger-${dateStr}.pdf`,
      };
    } else {
      const bills = customer.txns.filter((tx) => tx.type === 'bill');
      if (bills.length === 0) {
        throw new Error('No bills found for this customer');
      }
      const billData = bills.map((b) => txnToBillData(b, displayName));
      return {
        blob: generateBillsPdf(billData, shopSettings as any, format),
        filename: `${displayName.replace(/\s+/g, '-')}-${format}-${dateStr}.pdf`,
      };
    }
  };

  const printLedgerFormat = (format: 'statement' | 'simple' | 'itemized' | 'creditLedger' | 'patti') => {
    setShowLedgerMenu(false);
    try {
      const { blob } = generateLedgerPdf(format);
      printPdfBlob(blob);
    } catch (err: any) {
      alert(err.message || 'Failed to generate PDF');
    }
  };

  const shareLedgerFormat = async (format: 'statement' | 'simple' | 'itemized' | 'creditLedger' | 'patti') => {
    setShowLedgerMenu(false);
    setLedgerStatus('generating');
    try {
      const { blob, filename } = generateLedgerPdf(format);
      setLedgerStatus('sharing');
      const result = await sharePdfViaWhatsApp(blob, filename, `${shopSettings.shopName || 'RVC'} — ${displayName}`);
      if (result === 'downloaded') {
        alert('PDF downloaded. WhatsApp Web is opening — please attach the downloaded PDF to your message.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate PDF');
    } finally {
      setLedgerStatus('idle');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href="/customers" className="flex items-center gap-1 text-xs text-[var(--bg-primary)] hover:underline">
          <ArrowLeftIcon size={14} /> {t('allCustomers')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{displayName}</h1>
          <AgingBadge aging={aging} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {t('bills')} {bills} · {t('payments')} {payments}
          {aging.oldestDate
            ? ` · ${t('oldestUnpaid')} ${fmtDate(aging.oldestDate)} (${aging.oldestDays} ${t('days')})`
            : ''}
        </p>
      </div>

      <section className="grid grid-cols-3 gap-2">
        <StatCard label={t('billed')} value={fmt(customer.billed)} />
        <StatCard label={t('paid')} value={fmt(customer.paid)} accent="success" />
        <StatCard label={t('due')} value={fmt(customer.due)} accent="primary" />
      </section>

      {/* Date range filter */}
      <section className="rounded-2xl bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {([
              { key: 'all', label: t('allTime') },
              { key: 'today', label: t('today') },
              { key: 'month', label: t('thisMonth') },
              { key: 'fy', label: fyLabel },
              { key: 'custom', label: t('custom') },
            ] as { key: RangePreset; label: string }[]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRangePreset(opt.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  rangePreset === opt.key
                    ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                    : 'border border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-base)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {rangePreset === 'fy' && (
              <select
                value={fyOffset}
                onChange={(e) => setFyOffset(Number(e.target.value))}
                className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-1.5 text-xs"
              >
                <option value={0}>FY {currentFYStartYear}-{String((currentFYStartYear + 1) % 100).padStart(2, '0')} (current)</option>
                <option value={-1}>FY {currentFYStartYear - 1}-{String(currentFYStartYear % 100).padStart(2, '0')}</option>
                <option value={-2}>FY {currentFYStartYear - 2}-{String((currentFYStartYear - 1) % 100).padStart(2, '0')}</option>
              </select>
            )}
          </div>
          {rangePreset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-1.5 text-xs"
              />
              <span className="text-xs text-[var(--text-muted)]">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-1.5 text-xs"
              />
            </div>
          )}
          {rangePreset !== 'all' && (
            <button
              onClick={() => { setRangePreset('all'); setFromDate(''); setToDate(''); }}
              className="text-xs text-[var(--bg-primary)] hover:underline"
            >
              {t('clear')}
            </button>
          )}
        </div>
      </section>

      <Card>
        <SectionHeader title={t('actions')} icon={<DollarIcon size={16} />} />
        <div className="flex flex-wrap gap-2">
          <a
            href={waLink(reminderText(customer, shopSettings.shopName || 'RVC', displayName), customer.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--text-on-primary)] ${customer.due > 0 ? 'bg-[var(--bg-success)] hover:bg-[var(--bg-success-hover)]' : 'bg-[#a8a095] pointer-events-none'}`}
          >
            <MessageIcon size={14} /> {t('sendReminder')}
          </a>
          <a
            href={waLink(statementText(customer, shopSettings.shopName || 'RVC', displayName), customer.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-primary)] px-3 py-1.5 text-sm font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
          >
            <MessageIcon size={14} /> {t('shareStatement')}
          </a>
          <Button variant="outline" size="sm" onClick={copyStatement}>
            <span className="flex items-center gap-1.5">{copied ? <><CheckIcon size={14} /> {t('copied')}</> : t('copyStatement')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(`${displayName.replace(/\s+/g, '-')}-ledger.csv`, customerCsv(customer))}>
            <span className="flex items-center gap-1.5"><DownloadIcon size={14} /> {t('exportCsv')}</span>
          </Button>
          <span className="relative">
            <Button variant="primary" size="sm" onClick={() => setShowLedgerMenu((v) => !v)} disabled={ledgerStatus !== 'idle'}>
              <span className="flex items-center gap-1.5">
                <PrinterIcon size={14} /> {ledgerStatus === 'generating' ? 'Generating…' : ledgerStatus === 'sharing' ? 'Sharing…' : t('ledger')} ▾
              </span>
            </Button>
            {showLedgerMenu && (
              <span className="absolute right-0 top-9 z-10 w-64 rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                <div className="px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Customer statement</p>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => printLedgerFormat('statement')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                      🖨 Print
                    </button>
                    <button onClick={() => shareLedgerFormat('statement')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                      📤 Share
                    </button>
                  </div>
                </div>
                <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{t('billFormatSimple')}</p>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => printLedgerFormat('simple')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                      🖨 Print
                    </button>
                    <button onClick={() => shareLedgerFormat('simple')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                      📤 Share
                    </button>
                  </div>
                </div>
                <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{t('billFormatItemized')}</p>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => printLedgerFormat('itemized')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                      🖨 Print
                    </button>
                    <button onClick={() => shareLedgerFormat('itemized')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">
                      📤 Share
                    </button>
                  </div>
                </div>
                <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{t('printCreditLedger')} (this customer)</p>
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
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{t('billFormatPatti')} (6 per page)</p>
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

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-light)] pt-3">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <DollarIcon size={14} /> {t('creditLimit')}
          </label>
          <input
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder={t('noCreditLimit')}
            inputMode="decimal"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm sm:w-48 sm:flex-none"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={saveCreditLimit}
            disabled={creditStatus === 'saving'}
          >
            {creditStatus === 'saved' ? t('saved') : t('setCreditLimit')}
          </Button>
          {customer.creditLimit && customer.due > customer.creditLimit && (
            <span className="text-xs text-[var(--bg-primary)] font-medium">
              {t('creditOver')} {fmt(customer.due - (customer.creditLimit || 0))}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <PhoneIcon size={14} /> {t('phone')}
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('addPhone')}
            inputMode="tel"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm sm:w-48 sm:flex-none"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={savePhone}
            disabled={phoneStatus === 'saving'}
          >
            {phoneStatus === 'saved' ? t('saved') : t('savePhone')}
          </Button>
        </div>
      </Card>

      <section className="space-y-2">
        <SectionHeader title={t('ledger')} />
        <LedgerTable
          customer={customer}
          shop={shopSettings}
          defaultFormat={(shopSettings.billFormat as any) || 'itemized'}
          filteredTxns={rangePreset === 'all' ? undefined : filteredTxns}
          openingBalance={rangePreset === 'all' ? 0 : openingBalance}
          readOnly={rangePreset === 'fy' && fyOffset < 0}
        />
      </section>
    </div>
  );
}
