'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../components/I18nProvider';
import { useDashboard } from '../../components/useDashboard';
import TxnCard from '../../components/TxnCard';
import LedgerTable from '../../components/LedgerTable';
import AgingBadge from '../../components/AgingBadge';
import { fmt, fmtDate } from '@/lib/format';
import {
  computeAging,
  customerCsv,
  downloadCsv,
  reminderText,
  statementText,
  waLink,
} from '@/lib/statement';
import { printBill, printBills, txnToBillData } from '@/lib/billPrint';

export default function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { customers, loading } = useDashboard();
  const customer = useMemo(() => customers.find((c) => c.id === id), [customers, id]);

  const [phone, setPhone] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [copied, setCopied] = useState(false);
  const [creditLimit, setCreditLimit] = useState('');
  const [creditStatus, setCreditStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [shopSettings, setShopSettings] = useState<{ shopName?: string; shopAddress?: string; shopPhone?: string; billFormat?: string }>({});
  const [showPdfFormats, setShowPdfFormats] = useState(false);

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
    return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;
  }

  if (!customer) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-faint)]">{t('noCustomers')}</p>
        <Link href="/customers" className="text-sm text-[var(--bg-primary)] hover:underline">
          {t('allCustomers')}
        </Link>
      </div>
    );
  }

  const bills = customer.txns.filter((x) => x.type === 'bill').length;
  const payments = customer.txns.filter((x) => x.type === 'payment').length;
  const aging = computeAging(customer.txns);

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
      await navigator.clipboard.writeText(statementText(customer));
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

  const printPdf = () => {
    setShowPdfFormats((v) => !v);
  };

  const printStatement = (format: 'statement' | 'simple' | 'itemized' | 'market') => {
    setShowPdfFormats(false);
    if (format === 'statement') {
      // Original statement format — all transactions summary
      const win = window.open('', '_blank');
      if (!win) return;
      const shopName = shopSettings.shopName || 'RVC Vegetable Shop';
      const shopAddr = shopSettings.shopAddress || 'Bowenpally, Hyderabad';
      const shopPh = shopSettings.shopPhone || '';
      const html = `<!DOCTYPE html><html><head><title>${customer.name} - Statement</title>
      <style>
        body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;color:#333}
        h1{color:#8b2e2e;border-bottom:2px solid #8b2e2e;padding-bottom:8px}
        h2{font-size:14px;color:#666;margin-top:24px}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
        th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #ddd}
        th{background:#f5f0e6;font-size:11px;text-transform:uppercase}
        .due{color:#8b2e2e;font-weight:bold;font-size:18px}
        .shop{text-align:right;font-size:12px;color:#888}
        @media print{body{margin:0}}
      </style></head><body>
      <div class="shop">${shopName}<br>${shopAddr}${shopPh ? '<br>' + shopPh : ''}</div>
      <h1>Customer Statement</h1>
      <p><strong>${customer.name}</strong><br>
      Date: ${new Date().toLocaleDateString('en-IN')}</p>
      <h2>Summary</h2>
      <table><tr><th>Total Billed</th><th>Total Paid</th><th>Outstanding</th></tr>
      <tr><td>₹${customer.billed.toFixed(2)}</td><td>₹${customer.paid.toFixed(2)}</td><td class="due">₹${customer.due.toFixed(2)}</td></tr></table>
      <h2>Ledger</h2>
      <table><tr><th>Date</th><th>Type</th><th>Bill No</th><th>Amount</th></tr>
      ${customer.txns.map((tx) => `<tr><td>${fmtDate(tx.date)}</td><td>${tx.type === 'bill' ? 'Bill' : 'Payment'}</td><td>${tx.billNo || ''}</td><td>₹${tx.amount.toFixed(2)}</td></tr>`).join('')}
      </table>
      <p style="margin-top:24px;font-size:11px;color:#888">Generated by ${shopName} on ${new Date().toLocaleString('en-IN')}</p>
      <script>window.onload=()=>window.print()</script>
      </body></html>`;
      win.document.write(html);
      win.document.close();
    } else {
      // Print ALL bills in selected format — each bill on its own page
      const bills = customer.txns.filter((tx) => tx.type === 'bill');
      if (bills.length === 0) {
        alert('No bills found for this customer');
        return;
      }
      const billData = bills.map((b) => txnToBillData(b, customer.name));
      printBills(billData, shopSettings, format);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href="/customers" className="text-xs text-[var(--bg-primary)] hover:underline">
          ← {t('allCustomers')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{customer.name}</h1>
          <AgingBadge aging={aging} />
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {t('bills')} {bills} · {t('payments')} {payments}
          {aging.oldestDate
            ? ` · ${t('oldestUnpaid')} ${fmtDate(aging.oldestDate)} (${aging.oldestDays} ${t('days')})`
            : ''}
        </p>
      </div>

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('billed')}</p>
          <p className="font-bold">{fmt(customer.billed)}</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('paid')}</p>
          <p className="font-bold">{fmt(customer.paid)}</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('due')}</p>
          <p className="font-bold text-[var(--bg-primary)]">{fmt(customer.due)}</p>
        </div>
      </section>

      <section className="rounded-lg bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap gap-2">
          <a
            href={waLink(reminderText(customer), customer.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-md px-3 py-1.5 text-sm text-[var(--text-on-primary)] ${customer.due > 0 ? 'bg-[var(--bg-success)]' : 'bg-[#a8a095] pointer-events-none'}`}
          >
            {t('sendReminder')}
          </a>
          <a
            href={waLink(statementText(customer), customer.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]"
          >
            {t('shareStatement')}
          </a>
          <button
            onClick={copyStatement}
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
          >
            {copied ? t('copied') : t('copyStatement')}
          </button>
          <button
            onClick={() =>
              downloadCsv(`${customer.name.replace(/\s+/g, '-')}-ledger.csv`, customerCsv(customer))
            }
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
          >
            {t('exportCsv')}
          </button>
          <span className="relative">
            <button
              onClick={printPdf}
              className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
            >
              {t('downloadPdf')} ▾
            </button>
            {showPdfFormats && (
              <span className="absolute right-0 top-9 z-10 flex flex-col gap-0.5 rounded-md border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                <button
                  onClick={() => printStatement('statement')}
                  className="whitespace-nowrap rounded px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-card)]"
                >
                  Customer statement (all transactions)
                </button>
                <button
                  onClick={() => printStatement('simple')}
                  className="whitespace-nowrap rounded px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-card)]"
                >
                  {t('billFormatSimple')}
                </button>
                <button
                  onClick={() => printStatement('itemized')}
                  className="whitespace-nowrap rounded px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-card)]"
                >
                  {t('billFormatItemized')}
                </button>
                <button
                  onClick={() => printStatement('market')}
                  className="whitespace-nowrap rounded px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-card)]"
                >
                  {t('billFormatMarket')}
                </button>
              </span>
            )}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">{t('creditLimit')}</label>
          <input
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder={t('noCreditLimit')}
            inputMode="decimal"
            className="min-w-0 flex-1 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-sm sm:w-48 sm:flex-none"
          />
          <button
            onClick={saveCreditLimit}
            disabled={creditStatus === 'saving'}
            className="rounded-md bg-[var(--bg-secondary)] px-3 py-1 text-sm text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {creditStatus === 'saved' ? t('saved') : t('setCreditLimit')}
          </button>
          {customer.creditLimit && customer.due > customer.creditLimit && (
            <span className="text-xs text-[var(--bg-primary)]">
              {t('creditOver')} {fmt(customer.due - (customer.creditLimit || 0))}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">{t('phone')}</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('addPhone')}
            inputMode="tel"
            className="min-w-0 flex-1 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-sm sm:w-48 sm:flex-none"
          />
          <button
            onClick={savePhone}
            disabled={phoneStatus === 'saving'}
            className="rounded-md bg-[var(--bg-secondary)] px-3 py-1 text-sm text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {phoneStatus === 'saved' ? t('saved') : t('savePhone')}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('ledger')}</h2>
        <LedgerTable customer={customer} shop={shopSettings} defaultFormat={(shopSettings.billFormat as any) || 'itemized'} />
      </section>
    </div>
  );
}
