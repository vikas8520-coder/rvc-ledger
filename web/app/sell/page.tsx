'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import CustomerPicker, { CustomerOption } from '../components/CustomerPicker';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function num(s: string | number | null | undefined): number {
  const n = typeof s === 'number' ? s : parseFloat(s || '');
  return Number.isFinite(n) ? n : 0;
}

interface SaleLine {
  id: string;
  item: string;
  farmer: string;
  customerId: string | null;
  customerName: string;
  englishName?: string | null;
  teluguName?: string | null;
  hindiName?: string | null;
  bags: string;
  kgs: string;
  rate: string;
  hamaliEnabled: boolean;
  hamali: string;
  amount: number;
  saved: boolean; // already in DB
  txnId?: string; // transaction ID if saved
}

let idCounter = 0;
function newId() { return `line-${Date.now()}-${idCounter++}`; }

export default function SellPage() {
  const { t, lang } = useI18n();
  const uiLang = getUiLang(lang);
  const [date, setDate] = useState(today());
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);

  // Entry form state
  const [item, setItem] = useState('');
  const [farmer, setFarmer] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [bags, setBags] = useState('');
  const [kgs, setKgs] = useState('');
  const [rate, setRate] = useState('');
  const [hamaliEnabled, setHamaliEnabled] = useState(false);
  const [hamali, setHamali] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Day grid state
  const [dayLines, setDayLines] = useState<SaleLine[]>([]);

  // Add customer modal
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEnglishName, setNewCustomerEnglishName] = useState('');
  const [newCustomerTeluguName, setNewCustomerTeluguName] = useState('');
  const [newCustomerHindiName, setNewCustomerHindiName] = useState('');

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => {
        const list: CustomerOption[] = d.customers || [];
        setCustomers(list);
        // Auto-select CASH SALES if it exists
        const cash = list.find((c) => c.name === 'CASH SALES');
        if (cash) {
          setCustomerId(cash.id);
          setCustomerName(cash.name);
        }
      })
      .catch(() => {});
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => {
        const items = (d.items || []).map((i: any) => i.name).filter(Boolean);
        setCatalog(items);
      })
      .catch(() => {});
  }, []);

  // Load day's sales when date changes
  useEffect(() => {
    if (!date) return;
    fetch(`/api/sales?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        setDayLines((d.lines || []).map((l: any) => ({
          id: l.id || newId(),
          item: l.item || '',
          farmer: l.farmer || '',
          customerId: l.customerId || null,
          customerName: l.customerName || '',
          englishName: l.englishName || null,
          teluguName: l.teluguName || null,
          hindiName: l.hindiName || null,
          bags: l.bags ? String(l.bags) : '',
          kgs: l.kgs ? String(l.kgs) : '',
          rate: l.rate ? String(l.rate) : '',
          hamaliEnabled: num(l.hamali) > 0,
          hamali: l.hamali ? String(l.hamali) : '',
          amount: num(l.amount),
          saved: true,
          txnId: l.txnId,
        })));
      })
      .catch(() => {});
  }, [date]);

  // Auto-calculate amount
  const computedAmount = (() => {
    const k = num(kgs);
    const b = num(bags);
    const r = num(rate);
    const base = k > 0 ? k * r : b * r;
    const h = hamaliEnabled ? num(hamali) : 0;
    return Math.round(base + h);
  })();

  const canSave = item.trim() && (customerId || customerName.trim()) && (num(bags) > 0 || num(kgs) > 0) && num(rate) > 0;

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const items = [{
        raw_text: item.trim(),
        confirmed_name: item.trim(),
        qty: kgs || null,
        rate: rate,
        amount: computedAmount,
        display: `${bags || 0} bags${kgs ? `, ${kgs} kg` : ''} @ ₹${rate}`,
        kind: 'item',
        chargeCode: null,
        farmer: farmer.trim() || null,
        hamali: hamaliEnabled ? num(hamali) : null,
        bags: num(bags) || null,
      }];
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerId,
          date,
          billNo: null,
          total: computedAmount,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      // Add to day grid
      const selectedCustomer = customers.find((c) => c.id === customerId);
      setDayLines(prev => [...prev, {
        id: newId(),
        item: item.trim(),
        farmer: farmer.trim(),
        customerId,
        customerName: customerName.trim(),
        englishName: selectedCustomer?.englishName || null,
        teluguName: selectedCustomer?.teluguName || null,
        hindiName: selectedCustomer?.hindiName || null,
        bags,
        kgs,
        rate,
        hamaliEnabled,
        hamali: hamaliEnabled ? hamali : '',
        amount: computedAmount,
        saved: true,
      }]);

      // Reset form for next entry
      setBags(''); setKgs(''); setRate(''); setHamali(''); setHamaliEnabled(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Totals
  const totalBags = dayLines.reduce((s, l) => s + num(l.bags), 0);
  const totalKgs = dayLines.reduce((s, l) => s + num(l.kgs), 0);
  const totalAmount = dayLines.reduce((s, l) => s + l.amount, 0);
  const totalHamali = dayLines.reduce((s, l) => s + (l.hamaliEnabled ? num(l.hamali) : 0), 0);
  const cashTotal = dayLines.filter((l) => l.customerName === 'CASH SALES').reduce((s, l) => s + l.amount, 0);
  const creditTotal = dayLines.filter((l) => l.customerName !== 'CASH SALES').reduce((s, l) => s + l.amount, 0);

  const handleAddCustomer = async () => {
    if (!newCustomerName.trim()) return;
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          englishName: newCustomerEnglishName.trim() || null,
          teluguName: newCustomerTeluguName.trim() || null,
          hindiName: newCustomerHindiName.trim() || null,
          phone: newCustomerPhone.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newC: CustomerOption = {
          id: data.id,
          name: newCustomerName.trim(),
          englishName: newCustomerEnglishName.trim() || null,
          teluguName: newCustomerTeluguName.trim() || null,
          hindiName: newCustomerHindiName.trim() || null,
          phone: newCustomerPhone.trim() || null,
        };
        setCustomers(prev => [...prev, newC]);
        setCustomerId(newC.id);
        setCustomerName(newC.name);
        setShowAddCustomer(false);
        setNewCustomerName(''); setNewCustomerEnglishName(''); setNewCustomerTeluguName(''); setNewCustomerHindiName(''); setNewCustomerPhone('');
      }
    } catch (e) {
      console.error('Failed to add customer:', e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('sell')}</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-1.5 text-sm"
          />
        </div>
      </div>

      {/* Entry form */}
      <section className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3 overflow-visible">
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Item */}
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('item')}</label>
            <input
              type="text"
              list="item-list"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="e.g. W.MIRCHI, BEANS"
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm"
            />
            <datalist id="item-list">
              {catalog.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Farmer */}
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('farmer')}</label>
            <input
              type="text"
              value={farmer}
              onChange={(e) => setFarmer(e.target.value)}
              placeholder="e.g. SK 170"
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm"
            />
          </div>

          {/* Buyer */}
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('customer')}</label>
            <CustomerPicker
              customers={customers}
              value={customerId}
              onChange={(cid, cname) => {
                setCustomerId(cid);
                setCustomerName(cname);
              }}
              onAddNew={() => setShowAddCustomer(true)}
              placeholder={t('selectCustomer')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('bags')}</label>
            <input
              type="number"
              value={bags}
              onChange={(e) => setBags(e.target.value)}
              placeholder="0"
              inputMode="numeric"
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('kgs')}</label>
            <input
              type="number"
              value={kgs}
              onChange={(e) => setKgs(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('rate')}</label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] flex items-center gap-1">
              <input
                type="checkbox"
                checked={hamaliEnabled}
                onChange={(e) => setHamaliEnabled(e.target.checked)}
                className="h-3 w-3"
              />
              {t('hamali')}
            </label>
            <input
              type="number"
              value={hamali}
              onChange={(e) => setHamali(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              disabled={!hamaliEnabled}
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm disabled:opacity-40"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('amount')}</label>
            <div className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm font-bold text-[var(--bg-primary)]">
              {computedAmount > 0 ? fmt(computedAmount) : '—'}
            </div>
          </div>
        </div>

        {saveError && <p className="text-sm text-[var(--bg-primary)]">{saveError}</p>}
        {saveSuccess && <p className="text-sm text-[var(--bg-success)]">✓ {t('saved')}</p>}

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-lg bg-[var(--bg-primary)] py-2.5 text-sm font-medium text-[var(--text-on-primary)] disabled:opacity-40"
        >
          {saving ? t('saving') : t('saveLine')}
        </button>
      </section>

      {/* Day grid */}
      {dayLines.length > 0 && (
        <section className="rounded-2xl bg-[var(--bg-card)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">
            {t('salesToday')} — {dayLines.length} {t('lines')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-light)] text-left text-xs text-[var(--text-muted)]">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">{t('item')}</th>
                  <th className="py-1.5 pr-2">{t('buyer')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('bags')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('kgs')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('rate')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('hamali')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('amount')}</th>
                  <th className="py-1.5 pr-2">{t('farmer')}</th>
                </tr>
              </thead>
              <tbody>
                {dayLines.map((l, i) => {
                  const isCash = l.customerName === 'CASH SALES';
                  const displayName = formatCustomerName({
                    name: l.customerName,
                    englishName: l.englishName,
                    teluguName: l.teluguName,
                    hindiName: l.hindiName,
                  }, uiLang);
                  return (
                    <tr key={l.id} className={`border-l-4 ${isCash ? 'border-l-[var(--bg-success)]' : 'border-l-[var(--bg-primary)]'} border-b border-[var(--border-light)]`}>
                      <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)]">{i + 1}</td>
                      <td className="py-1.5 pr-2 font-medium">{l.item}</td>
                      <td className="py-1.5 pr-2">{displayName}</td>
                      <td className="py-1.5 pr-2 text-right">{l.bags || '—'}</td>
                      <td className="py-1.5 pr-2 text-right">{l.kgs || '—'}</td>
                      <td className="py-1.5 pr-2 text-right">{l.rate}</td>
                      <td className="py-1.5 pr-2 text-right">{l.hamaliEnabled ? l.hamali : '—'}</td>
                      <td className="py-1.5 pr-2 text-right font-medium">{fmt(l.amount)}</td>
                      <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)]">{l.farmer || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer totals */}
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-[var(--border-light)] pt-3">
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('totalBags')}</p>
              <p className="text-lg font-bold">{totalBags}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('totalKgs')}</p>
              <p className="text-lg font-bold">{totalKgs > 0 ? totalKgs.toFixed(1) : '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('totalAmount')}</p>
              <p className="text-lg font-bold text-[var(--bg-primary)]">{fmt(totalAmount)}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-lg border-l-4 border-l-[var(--bg-success)] bg-[var(--bg-base)] p-2 text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('cash')}</p>
              <p className="text-sm font-bold">{fmt(cashTotal)}</p>
            </div>
            <div className="rounded-lg border-l-4 border-l-[var(--bg-primary)] bg-[var(--bg-base)] p-2 text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('credit')}</p>
              <p className="text-sm font-bold">{fmt(creditTotal)}</p>
            </div>
          </div>
        </section>
      )}

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddCustomer(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{t('addCustomer')}</h3>
              <button onClick={() => setShowAddCustomer(false)} className="text-[var(--text-muted)]">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t('customerName')}</label>
                <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="e.g. SURENDR 1"
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t('phone')}</label>
                <input type="tel" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder={t('phone')}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-[var(--text-muted)]">English</label>
                  <input type="text" value={newCustomerEnglishName} onChange={(e) => setNewCustomerEnglishName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)]">తెలుగు</label>
                  <input type="text" value={newCustomerTeluguName} onChange={(e) => setNewCustomerTeluguName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)]">हिंदी</label>
                  <input type="text" value={newCustomerHindiName} onChange={(e) => setNewCustomerHindiName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAddCustomer(false)}
                className="flex-1 rounded-lg border border-[var(--border-input)] py-2 text-sm text-[var(--text-primary)]">
                {t('cancel')}
              </button>
              <button onClick={handleAddCustomer}
                className="flex-1 rounded-lg bg-[var(--bg-primary)] py-2 text-sm font-medium text-[var(--text-on-primary)]">
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
