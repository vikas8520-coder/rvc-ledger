'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../components/usePersistentState';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { Card, SectionHeader, StatCard, Button, EmptyState, ListSkeleton, PageHeader } from '../components/ui';
import { StoreIcon, SearchIcon, DownloadIcon, DollarIcon, XIcon, CheckIcon } from '../components/Icons';
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
  const [payDate, setPayDate] = usePersistentState('suppliers-pay-date', today());
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

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('navSuppliers')} />
        <ListSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('navSuppliers')}
        subtitle={`${suppliers.length} ${t('supplier')}`}
      />

      <StatCard label={t('totalSupplierBalance')} value={fmt(totalBalance)} accent="primary" icon={<DollarIcon size={14} />} />

      {/* Action bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchSuppliers')}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv('rvc-suppliers.csv', suppliersCsv(suppliers))}>
          <span className="flex items-center gap-1.5"><DownloadIcon size={14} /> {t('exportCsv')}</span>
        </Button>
        <Button variant="success" size="sm" onClick={() => setShowPay(true)}>
          <span className="flex items-center gap-1.5"><DollarIcon size={14} /> {t('paySupplier')}</span>
        </Button>
      </div>

      {/* Payment form */}
      {showPay && (
        <Card>
          <SectionHeader
            title={t('paySupplier')}
            icon={<DollarIcon size={16} />}
            action={
              <button onClick={() => setShowPay(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <XIcon size={16} />
              </button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('supplier')}</label>
              <input
                list="supplier-list"
                value={paySupplier}
                onChange={(e) => setPaySupplier(e.target.value)}
                placeholder={t('selectSupplier')}
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
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
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-[var(--text-muted)]">{t('notes')}</label>
            <input
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder={t('notes')}
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
          </div>
          {payError && <p className="mt-3 text-sm text-[var(--bg-primary)]">{payError}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="success" onClick={submitPayment} disabled={paying}>
              {paying ? t('saving') : t('recordPayment')}
            </Button>
            <Button variant="outline" onClick={() => setShowPay(false)}>
              {t('cancel')}
            </Button>
          </div>
        </Card>
      )}

      {/* Supplier list */}
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<StoreIcon size={48} />}
            title={t('noSuppliers')}
            description="Add suppliers by recording purchases from farmers."
            action={{ label: t('navPurchases'), href: '/purchases' }}
          />
        </Card>
      ) : (
        <Card padding="p-0">
          <ul className="divide-y divide-[var(--border-light)]">
            {list.map((s) => (
              <li key={s.id}>
                <Link href={`/suppliers/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {t('purchased')} {fmt(s.purchased)} · {t('paid')} {fmt(s.paid)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold ${s.balance > 0 ? 'text-[var(--bg-primary)]' : 'text-[var(--bg-success)]'}`}>
                      {fmt(s.balance)}
                    </p>
                    <p className="text-[10px] text-[var(--text-faint)]">{s.balance > 0 ? t('due') : t('paid')}</p>
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
