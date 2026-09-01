'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../components/usePersistentState';
import Link from 'next/link';
import { useI18n } from '../../components/I18nProvider';
import { fmt, fmtDate } from '@/lib/format';
import {
  downloadCsv,
  supplierCsv,
  supplierStatementText,
  waLink,
} from '@/lib/statement';
import { Supplier } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SupplierLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payDate, setPayDate] = usePersistentState('suppliers-pay-date', today());
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payStatus, setPayStatus] = useState<'idle' | 'saving'>('idle');

  const [phone, setPhone] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const load = () => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => {
        const found = (d.suppliers || []).find((s: Supplier) => s.id === id);
        setSupplier(found || null);
        if (found?.phone) setPhone(found.phone);
      })
      .catch(() => setSupplier(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const savePayment = async () => {
    if (!supplier || !payAmount) return;
    setPayStatus('saving');
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName: supplier.name,
          date: payDate,
          amount: Number(payAmount),
          notes: payNotes,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setPayAmount('');
      setPayNotes('');
      setPayOpen(false);
      setPayStatus('idle');
      load();
    } catch {
      setPayStatus('idle');
    }
  };

  const savePhone = async () => {
    if (!supplier) return;
    setPhoneStatus('saving');
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
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
    if (!supplier) return;
    try {
      await navigator.clipboard.writeText(supplierStatementText(supplier));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;

  if (!supplier) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-faint)]">{t('noSuppliers')}</p>
        <Link href="/suppliers" className="text-sm text-[var(--bg-primary)] hover:underline">
          {t('allSuppliers')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/suppliers" className="text-xs text-[var(--bg-primary)] hover:underline">
          ← {t('allSuppliers')}
        </Link>
        <h1 className="text-lg sm:text-xl font-bold break-words">{supplier.name}</h1>
      </div>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('purchased')}</p>
          <p className="font-bold">{fmt(supplier.purchased)}</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('paid')}</p>
          <p className="font-bold">{fmt(supplier.paid)}</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('supplierBalance')}</p>
          <p className={`font-bold ${supplier.balance > 0 ? 'text-[var(--bg-primary)]' : 'text-[var(--bg-success)]'}`}>
            {fmt(supplier.balance)}
          </p>
        </div>
      </section>

      <section className="rounded-lg bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPayOpen((v) => !v)}
            className="rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]"
          >
            {t('recordSupplierPayment')}
          </button>
          <a
            href={waLink(supplierStatementText(supplier), supplier.phone)}
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
            onClick={() => downloadCsv(`${supplier.name.replace(/\s+/g, '-')}-supplier.csv`, supplierCsv(supplier))}
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
          >
            {t('exportCsv')}
          </button>
        </div>

        {payOpen && (
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('amountReceived')}</label>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('notes')}</label>
              <input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={savePayment}
              disabled={payStatus === 'saving' || !payAmount}
              className="mt-5 rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] disabled:opacity-50"
            >
              {payStatus === 'saving' ? t('saving') : t('savePurchase')}
            </button>
          </div>
        )}

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
        {supplier.entries.length === 0 && <p className="text-sm text-[var(--text-faint)]">{t('noActivity')}</p>}
        {supplier.entries.map((e) => (
          <div key={e.id} className="rounded-lg bg-[var(--bg-card)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-[var(--text-muted)]">{fmtDate(e.date)}</p>
                <p className="text-sm font-medium">
                  {e.type === 'payment' ? t('paymentReceived') : e.billNo ? `${t('bill')} ${e.billNo}` : t('bill')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold ${e.type === 'payment' ? 'text-[var(--bg-success)]' : 'text-[var(--text-primary)]'}`}>
                  {e.type === 'payment' ? '-' : '+'}{fmt(e.amount)}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">{t('balanceAfter')} {fmt(e.balanceAfter)}</p>
              </div>
            </div>
            {e.items && e.items.length > 0 && (
              <div className="mt-1.5 overflow-x-auto">
              <table className="w-full text-[12px] tabular-nums leading-5">
                <tbody>
                  {e.items.map((it, i) => (
                    <tr key={i} className={it.kind === 'charge' ? 'italic text-[#6b5344]' : ''}>
                      <td className="pr-2">{it.name}</td>
                      <td className="whitespace-nowrap pr-2 text-right text-[var(--text-muted)]">
                        {[it.qty, it.rate].filter(Boolean).join(' × ')}
                      </td>
                      <td className="whitespace-nowrap text-right">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
