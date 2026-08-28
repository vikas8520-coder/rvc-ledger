'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { CatalogItem, StockLevel } from '@/lib/types';
import { printBill, ShopProfile } from '@/lib/billPrint';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface BillRow {
  itemId: string;
  name: string;
  qty: string;
  rate: string;
  amount: string;
}

export default function QuickBillPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(today());
  const [billNo, setBillNo] = useState('');
  const [rows, setRows] = useState<BillRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState('');
  const [savedBill, setSavedBill] = useState<{ customerName: string; date: string; billNo: string; total: number; items: BillRow[] } | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopProfile>({});
  const [customerData, setCustomerData] = useState<{ name: string; due: number; creditLimit: number | null }[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/catalog').then((r) => r.json()),
      fetch('/api/stock').then((r) => r.json()),
      fetch('/api/dashboard').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([cat, stk, dash, settings]) => {
        setCatalog(cat.items || []);
        setStock(stk.stock || []);
        setCustomers((dash.customers || []).map((c: any) => c.name));
        setCustomerData((dash.customers || []).map((c: any) => ({ name: c.name, due: c.due, creditLimit: c.creditLimit ?? null })));
        setShopSettings(settings.settings || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stockMap = new Map(stock.map((s) => [s.itemKey, s]));
  const activeItems = catalog.filter((c) => c.active);

  const addItemRow = (item: CatalogItem) => {
    const key = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const stk = stockMap.get(key);
    setRows([
      ...rows,
      {
        itemId: item.id,
        name: item.name,
        qty: '',
        rate: item.defaultSellPrice ? String(item.defaultSellPrice) : '',
        amount: '',
      },
    ]);
  };

  const updateRow = (i: number, field: keyof BillRow, value: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    if (field === 'qty' || field === 'rate') {
      const q = parseFloat(next[i].qty);
      const r = parseFloat(next[i].rate);
      if (Number.isFinite(q) && Number.isFinite(r)) {
        next[i].amount = String(Math.round(q * r * 100) / 100);
      }
    }
    setRows(next);
  };

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // Credit limit check
  const selectedCustomer = customerData.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
  const creditWarning = selectedCustomer && selectedCustomer.creditLimit && selectedCustomer.creditLimit > 0
    ? (selectedCustomer.due + total > selectedCustomer.creditLimit
      ? `${t('creditLimitWarning')}: ${fmt(selectedCustomer.creditLimit)} · ${t('currentDue')}: ${fmt(selectedCustomer.due)} · ${t('afterThisBill')}: ${fmt(selectedCustomer.due + total)}`
      : null)
    : null;

  const save = async () => {
    setStatus('saving');
    setError('');
    try {
      if (!customerName.trim()) throw new Error(t('selectCustomer'));
      const items = rows
        .filter((r) => r.name && r.amount)
        .map((r) => ({
          raw_text: r.name,
          confirmed_name: r.name,
          qty: r.qty.trim() || null,
          rate: r.rate.trim() || null,
          amount: Number(r.amount) || 0,
          kind: 'item' as const,
          chargeCode: null,
        }));
      if (!items.length) throw new Error(t('addItemToBill'));

      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          date,
          billNo: billNo || null,
          total,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      // Show success with print option
      setSavedBill({ customerName: customerName.trim(), date, billNo, total, items: rows.filter((r) => r.name && r.amount) });
      setRows([]);
      setBillNo('');
      setStatus('idle');
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setStatus('idle');
    }
  };

  const printSavedBill = (format: 'simple' | 'itemized' | 'market' | 'patti') => {
    if (!savedBill) return;
    const billItems = savedBill.items.map((r) => ({
      name: r.name,
      qty: r.qty || null,
      rate: r.rate || null,
      amount: Number(r.amount) || 0,
      display: [r.qty, r.rate].filter(Boolean).join(' × '),
      kind: 'item' as const,
      chargeCode: null,
    }));
    printBill(
      {
        customerName: savedBill.customerName,
        date: savedBill.date,
        billNo: savedBill.billNo || null,
        items: billItems,
        total: savedBill.total,
      },
      shopSettings,
      format
    );
  };

  if (loading) return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;

  if (savedBill) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-[var(--bg-success)] p-4 text-center text-[var(--text-on-primary)]">
          <p className="text-lg font-bold">✓ {t('bill')} {savedBill.billNo || ''} — {fmt(savedBill.total)}</p>
          <p className="text-sm opacity-90">{savedBill.customerName} · {savedBill.date}</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold">{t('printBill')}</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => printSavedBill('simple')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
              {t('billFormatSimple')}
            </button>
            <button onClick={() => printSavedBill('itemized')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
              {t('billFormatItemized')}
            </button>
            <button onClick={() => printSavedBill('market')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
              {t('billFormatMarket')}
            </button>
            <button onClick={() => printSavedBill('patti')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
              {t('billFormatPatti')}
            </button>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setSavedBill(null)} className="rounded-md bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)]">
              {t('quickBill')} →
            </button>
            <button onClick={() => router.push('/customers')} className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-4 py-2 text-sm">
              {t('allCustomers')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t('quickBill')}</h1>
      <p className="text-xs text-[var(--text-faint)]">{t('quickBillHelp')}</p>

      {activeItems.length === 0 ? (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">
          {t('noCatalogItemsForBill')}
        </p>
      ) : (
        <>
          <section className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('customer')}</label>
              <input
                list="customer-list"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('selectCustomer')}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
              <datalist id="customer-list">
                {customers.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
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
              <label className="text-xs text-[var(--text-muted)]">{t('billNo')}</label>
              <input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
          </section>

          {creditWarning && (
            <div className="rounded-lg bg-[var(--bg-warning)] bg-opacity-20 border border-[var(--bg-warning)] px-3 py-2">
              <p className="text-xs text-[#c4622d] font-medium">⚠ {creditWarning}</p>
            </div>
          )}

          <section className="rounded-lg bg-[var(--bg-card)] p-3">
            <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">{t('addItemToBill')}</p>
            <div className="flex flex-wrap gap-1.5">
              {activeItems.map((item) => {
                const key = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
                const stk = stockMap.get(key);
                return (
                  <button
                    key={item.id}
                    onClick={() => addItemRow(item)}
                    className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2.5 py-1.5 text-xs hover:bg-[#efe8db]"
                  >
                    {item.name}
                    {stk && (
                      <span className={`ml-1 ${stk.qty <= 0 ? 'text-[var(--bg-primary)]' : stk.qty < 5 ? 'text-[#c4622d]' : 'text-[var(--bg-success)]'}`}>
                        ({stk.qty}{stk.unit ? ` ${stk.unit}` : ''})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {rows.length > 0 && (
            <section className="space-y-2 rounded-lg bg-[var(--bg-card)] p-3">
              {rows.map((r, i) => {
                const key = r.name.toLowerCase().replace(/\s+/g, ' ').trim();
                const stk = stockMap.get(key);
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-12 items-end">
                    <div className="sm:col-span-4">
                      <label className="text-xs text-[var(--text-muted)]">{t('itemName')}</label>
                      <p className="text-sm font-medium">{r.name}</p>
                      {stk && (
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {t('inStock')}: {stk.qty}{stk.unit ? ` ${stk.unit}` : ''}
                          {stk.lastRate && ` · ${t('lastBuyRate')}: ${fmt(stk.lastRate)}`}
                        </p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-[var(--text-muted)]">{t('qty')}</label>
                      <input
                        value={r.qty}
                        onChange={(e) => updateRow(i, 'qty', e.target.value)}
                        placeholder="10 kg"
                        className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-[var(--text-muted)]">{t('rate')}</label>
                      <input
                        value={r.rate}
                        onChange={(e) => updateRow(i, 'rate', e.target.value)}
                        className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-xs text-[var(--text-muted)]">{t('amt')}</label>
                      <input
                        value={r.amount}
                        onChange={(e) => updateRow(i, 'amount', e.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => setRows(rows.filter((_, x) => x !== i))}
                      className="rounded-md bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-on-primary)] sm:col-span-1"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-[var(--border-light)] pt-2">
                <p className="text-sm font-semibold">{t('billTotal')}: {fmt(total)}</p>
                <button
                  onClick={save}
                  disabled={status === 'saving'}
                  className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
                >
                  {status === 'saving' ? t('saving') : t('saveBill')}
                </button>
              </div>
              {error && <p className="text-center text-sm text-[var(--bg-primary)]">{error}</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
