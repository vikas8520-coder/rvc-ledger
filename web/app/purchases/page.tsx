'use client';

import { useEffect, useState } from 'react';
import { usePersistentState } from '../components/usePersistentState';
import { useI18n } from '../components/I18nProvider';
import { fmt, fmtDate } from '@/lib/format';
import { MARKET_YARDS, EMPTY_MARKET, yardById, type MarketMeta } from '@/lib/market';
import { PurchaseView } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Row {
  name: string;
  qty: string;
  rate: string;
  amount: string;
}

const emptyRow: Row = { name: '', qty: '', rate: '', amount: '' };

export default function PurchasesPage() {
  const { t } = useI18n();
  const [purchases, setPurchases] = useState<PurchaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [date, setDate] = usePersistentState('purchases-date', today());
  const [supplier, setSupplier] = useState('');
  const [billNo, setBillNo] = useState('');
  const [market, setMarket] = useState<MarketMeta>(EMPTY_MARKET);
  const [rows, setRows] = useState<Row[]>([{ ...emptyRow }]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  const load = () => {
    fetch('/api/purchases')
      .then((r) => r.json())
      .then((d) => setPurchases(d.purchases || []))
      .catch(() => setPurchases([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const updateRow = (i: number, field: keyof Row, value: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    // auto-fill amount when qty and rate are plain numbers
    if (field === 'qty' || field === 'rate') {
      const q = parseFloat(next[i].qty);
      const r = parseFloat(next[i].rate);
      if (Number.isFinite(q) && Number.isFinite(r) && !next[i].rate.includes('/')) {
        next[i].amount = String(Math.round(q * r * 100) / 100);
      }
    }
    setRows(next);
  };

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const save = async () => {
    setStatus('saving');
    setError('');
    try {
      const items = rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          qty: r.qty.trim() || null,
          rate: r.rate.trim() || null,
          amount: Number(r.amount) || 0,
        }));
      if (!items.length) throw new Error('Add at least one item');

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, supplier, billNo, total, items, market }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      setRows([{ ...emptyRow }]);
      setSupplier('');
      setBillNo('');
      setOpen(false);
      setStatus('idle');
      load();
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setStatus('error');
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('navPurchases')}</h1>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]"
        >
          {open ? t('close') : t('addPurchase')}
        </button>
      </div>

      <p className="text-xs text-[var(--text-faint)]">{t('purchasesHelp')}</p>

      {open && (
        <section className="space-y-3 rounded-lg bg-[var(--bg-card)] p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('supplier')}</label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('billNo')}</label>
              <input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('marketYard')}</label>
              <select
                value={market.marketYard}
                onChange={(e) => {
                  const yard = yardById(e.target.value);
                  setMarket({
                    ...market,
                    marketYard: e.target.value,
                    marketType: yard?.type || market.marketType,
                  });
                }}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              >
                {MARKET_YARDS.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12">
                <input
                  value={r.name}
                  onChange={(e) => updateRow(i, 'name', e.target.value)}
                  placeholder={t('itemName')}
                  className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm sm:col-span-5"
                />
                <input
                  value={r.qty}
                  onChange={(e) => updateRow(i, 'qty', e.target.value)}
                  placeholder="50 kg"
                  className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm sm:col-span-2"
                />
                <input
                  value={r.rate}
                  onChange={(e) => updateRow(i, 'rate', e.target.value)}
                  placeholder="20"
                  className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm sm:col-span-2"
                />
                <input
                  value={r.amount}
                  onChange={(e) => updateRow(i, 'amount', e.target.value)}
                  placeholder={t('amt')}
                  inputMode="decimal"
                  className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm sm:col-span-2"
                />
                <button
                  onClick={() => setRows(rows.filter((_, x) => x !== i))}
                  className="rounded-md bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-on-primary)] sm:col-span-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => setRows([...rows, { ...emptyRow }])}
              className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-1.5 text-sm"
            >
              + {t('add')}
            </button>
            <p className="text-sm font-semibold">{t('total')}: {fmt(total)}</p>
          </div>

          <button
            onClick={save}
            disabled={status === 'saving'}
            className="w-full rounded-md bg-[var(--bg-success)] py-2 font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {status === 'saving' ? t('saving') : t('savePurchase')}
          </button>
          {error && <p className="text-center text-sm text-[var(--bg-primary)]">{error}</p>}
        </section>
      )}

      {loading && <p className="text-sm text-[var(--text-faint)]">{t('loading')}</p>}
      {!loading && purchases.length === 0 && (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">{t('noPurchases')}</p>
      )}

      <div className="space-y-2">
        {purchases.map((p) => (
          <div key={p.id} className="rounded-lg bg-[var(--bg-card)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-[var(--text-muted)]">
                  {fmtDate(p.date)}
                  {p.market?.marketYard ? ` · ${yardById(p.market.marketYard)?.name || p.market.marketYard}` : ''}
                </p>
                <p className="text-sm font-medium">
                  {p.supplier || t('supplier')}
                  {p.billNo ? ` · ${t('billNo')} ${p.billNo}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">{fmt(p.total)}</p>
            </div>
            {p.items.length > 0 && (
              <table className="mt-1.5 w-full text-[12px] tabular-nums leading-5">
                <tbody>
                  {p.items.map((it, i) => (
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
            )}
            <div className="mt-1 text-right">
              <button onClick={() => remove(p.id)} className="text-[11px] text-[var(--bg-primary)] hover:underline">
                {t('delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
