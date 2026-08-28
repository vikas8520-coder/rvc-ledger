'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { downloadCsv, suppliersCsv } from '@/lib/statement';
import { Supplier } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SuppliersPage() {
  const { t } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [paySupplier, setPaySupplier] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const load = () => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers || []))
      .catch(() => setSuppliers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? suppliers.filter((s) => s.name.toLowerCase().includes(needle)) : suppliers;
    return [...filtered].sort((a, b) => b.balance - a.balance);
  }, [suppliers, q]);

  const totalBalance = suppliers.reduce((s, sup) => s + sup.balance, 0);

  const submitPayment = async () => {
    setPaying(true);
    setPayError('');
    try {
      if (!paySupplier.trim()) throw new Error(t('selectSupplier'));
      const amount = Number(payAmount);
      if (!amount || amount <= 0) throw new Error(t('enterAmount'));
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierName: paySupplier.trim(), date: payDate, amount, notes: payNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setShowPay(false);
      setPaySupplier('');
      setPayAmount('');
      setPayNotes('');
      load();
    } catch (err: any) {
      setPayError(err.message || 'Failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t('navSuppliers')}</h1>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchSuppliers')}
            className="min-w-0 flex-1 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm sm:w-56 sm:flex-none"
          />
          <button
            onClick={() => downloadCsv('rvc-suppliers.csv', suppliersCsv(suppliers))}
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
          >
            {t('exportCsv')}
          </button>
          <button
            onClick={() => setShowPay(true)}
            className="rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]"
          >
            {t('paySupplier')}
          </button>
        </div>
      </div>

      {/* Total outstanding to suppliers */}
      <div className="rounded-lg bg-[var(--bg-card)] px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t('totalSupplierBalance')}</p>
        <p className="text-lg font-bold text-[var(--bg-primary)]">{fmt(totalBalance)}</p>
      </div>

      {/* Payment form */}
      {showPay && (
        <section className="rounded-lg bg-[var(--bg-card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold">{t('supplierPayment')}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('supplier')}</label>
              <input
                list="supplier-list"
                value={paySupplier}
                onChange={(e) => setPaySupplier(e.target.value)}
                placeholder={t('selectSupplier')}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
              <datalist id="supplier-list">
                {suppliers.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('amountReceived')}</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="₹0"
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('notes')}</label>
            <input
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder={t('notes')}
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
            />
          </div>
          {payError && <p className="text-center text-sm text-[var(--bg-primary)]">{payError}</p>}
          <div className="flex gap-2">
            <button
              onClick={submitPayment}
              disabled={paying}
              className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
            >
              {paying ? t('saving') : t('recordPayment')}
            </button>
            <button
              onClick={() => setShowPay(false)}
              className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-4 py-2 text-sm"
            >
              {t('cancel')}
            </button>
          </div>
        </section>
      )}

      {list.length === 0 && <p className="text-sm text-[var(--text-faint)]">{t('noSuppliers')}</p>}

      <ul className="divide-y divide-[var(--border-light)] overflow-hidden rounded-lg bg-[var(--bg-card)]">
        {list.map((s) => (
          <li key={s.id}>
            <Link href={`/suppliers/${s.id}`} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-[#efe8db]">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t('purchased')} {fmt(s.purchased)} · {t('paid')} {fmt(s.paid)}
                </p>
              </div>
              <p className={`shrink-0 text-sm font-semibold ${s.balance > 0 ? 'text-[var(--bg-primary)]' : 'text-[var(--bg-success)]'}`}>
                {fmt(s.balance)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
