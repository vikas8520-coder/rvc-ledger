'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePersistentState } from '../components/usePersistentState';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import Autocomplete from '../components/Autocomplete';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Types ───────────────────────────────────────────────

interface BagGroup {
  id: string;
  weightKg: string;
  numBags: string;
  pricePerKg: string;
}

interface SaleEntry {
  id: string;
  customerName: string;
  bags: string;
  weightKg: string;
  pricePerKg: string;
  amount: string;
}

// ─── Helpers ─────────────────────────────────────────────

let idCounter = 0;
function newId() {
  return `row-${Date.now()}-${idCounter++}`;
}

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ─── Main Component ──────────────────────────────────────

export default function EntryPage() {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Stock received
  const [date, setDate] = usePersistentState('entry-date', today());
  const [productName, setProductName] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [bagsCovers, setBagsCovers] = useState('');
  const [bigbags, setBigbags] = useState('');
  const [bagGroups, setBagGroups] = useState<BagGroup[]>([
    { id: newId(), weightKg: '', numBags: '', pricePerKg: '' },
  ]);
  const [samePrice, setSamePrice] = useState(true);

  // Step 2: Sales
  const [sales, setSales] = useState<SaleEntry[]>([
    { id: newId(), customerName: '', bags: '', weightKg: '', pricePerKg: '', amount: '' },
  ]);

  // Step 3: Summary
  const [commissionPct, setCommissionPct] = useState('10');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // Load existing customers and products for autocomplete
  const [customers, setCustomers] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [farmers, setFarmers] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => setCustomers((d.customers || []).map((c: any) => c.name)))
      .catch(() => {});
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => setCatalog((d.items || []).map((i: any) => i.name)))
      .catch(() => {});
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => setFarmers((d.suppliers || []).map((s: any) => s.name)))
      .catch(() => {});
  }, []);

  // ─── Calculations ────────────────────────────────────────

  const totalBagsReceived = num(bagsCovers) + num(bigbags);

  const stockWeight = bagGroups.reduce((s, g) => s + num(g.weightKg) * num(g.numBags), 0);
  const stockValue = bagGroups.reduce((s, g) => s + num(g.weightKg) * num(g.numBags) * num(g.pricePerKg), 0);

  const totalBagsSold = sales.reduce((s, e) => s + num(e.bags), 0);
  const totalWeightSold = sales.reduce((s, e) => s + num(e.weightKg), 0);
  const totalSalesAmount = sales.reduce((s, e) => s + num(e.amount), 0);

  const leftoverBags = totalBagsReceived - totalBagsSold;
  const leftoverWeight = stockWeight - totalWeightSold;

  const commissionAmount = (totalSalesAmount * num(commissionPct)) / 100;
  const farmerPayment = totalSalesAmount - commissionAmount;

  // ─── Step 1: Bag Groups ──────────────────────────────────

  const addBagGroup = () => {
    const lastPrice = samePrice && bagGroups.length > 0 ? bagGroups[0].pricePerKg : '';
    setBagGroups([...bagGroups, { id: newId(), weightKg: '', numBags: '', pricePerKg: lastPrice }]);
  };

  const updateBagGroup = (id: string, field: keyof BagGroup, value: string) => {
    setBagGroups(bagGroups.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };

  const removeBagGroup = (id: string) => {
    setBagGroups(bagGroups.filter((g) => g.id !== id));
  };

  // When samePrice is on, sync all prices to the first one
  useEffect(() => {
    if (samePrice && bagGroups.length > 0) {
      const firstPrice = bagGroups[0].pricePerKg;
      setBagGroups(bagGroups.map((g, i) => (i === 0 ? g : { ...g, pricePerKg: firstPrice })));
    }
  }, [samePrice]);

  // ─── Step 2: Sales ───────────────────────────────────────

  const addSale = () => {
    const defaultPrice = bagGroups[0]?.pricePerKg || '';
    setSales([...sales, {
      id: newId(),
      customerName: '',
      bags: '',
      weightKg: '',
      pricePerKg: defaultPrice,
      amount: '',
    }]);
  };

  const updateSale = (id: string, field: keyof SaleEntry, value: string) => {
    setSales(sales.map((s) => {
      if (s.id !== id) return s;
      const updated = { ...s, [field]: value };
      // Auto-calculate amount from weight × price
      if (field === 'weightKg' || field === 'pricePerKg') {
        const amt = num(updated.weightKg) * num(updated.pricePerKg);
        updated.amount = amt > 0 ? String(Math.round(amt)) : '';
      }
      return updated;
    }));
  };

  const removeSale = (id: string) => {
    setSales(sales.filter((s) => s.id !== id));
  };

  // ─── Validation ──────────────────────────────────────────

  const step1Valid = productName.trim() && totalBagsReceived > 0;
  const step2Valid = sales.some((s) => s.customerName.trim() && num(s.amount) > 0);

  // ─── Save ────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const validSales = sales.filter((s) => s.customerName.trim() && num(s.amount) > 0);

      // Save each sale as a bill
      for (const sale of validSales) {
        const items = [{
          raw_text: productName,
          confirmed_name: productName,
          qty: sale.weightKg ? `${sale.weightKg} kg` : (sale.bags ? `${sale.bags} bags` : ''),
          rate: sale.pricePerKg || null,
          amount: num(sale.amount),
          kind: 'item' as const,
          chargeCode: null,
        }];

        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: sale.customerName.trim(),
            date,
            billNo: null,
            total: num(sale.amount),
            items,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to save bill for ${sale.customerName}`);
        }
      }

      // Save purchase (stock received from farmer)
      if (farmerName.trim() && stockValue > 0) {
        const purchaseItems = bagGroups
          .filter((g) => num(g.numBags) > 0)
          .map((g) => ({
            name: productName,
            qty: `${num(g.weightKg) * num(g.numBags)} kg`,
            rate: g.pricePerKg || null,
            amount: num(g.weightKg) * num(g.numBags) * num(g.pricePerKg),
            kind: 'item' as const,
            chargeCode: null,
          }));

        if (purchaseItems.length > 0) {
          await fetch('/api/purchases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date,
              supplier: farmerName.trim(),
              total: stockValue,
              items: purchaseItems,
            }),
          });
        }
      }

      setSaved(true);
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep(1);
    setProductName('');
    setFarmerName('');
    setBagsCovers('');
    setBigbags('');
    setBagGroups([{ id: newId(), weightKg: '', numBags: '', pricePerKg: '' }]);
    setSales([{ id: newId(), customerName: '', bags: '', weightKg: '', pricePerKg: '', amount: '' }]);
    setCommissionPct('10');
    setSaved(false);
    setSaveError('');
  };

  // ─── Success Screen ──────────────────────────────────────

  if (saved) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-[var(--bg-success)] p-6 text-center text-[var(--text-on-primary)]">
          <p className="text-2xl font-bold">✓ Saved</p>
          <p className="mt-1 text-sm opacity-90">
            {sales.filter((s) => s.customerName.trim()).length} bills saved · {fmt(totalSalesAmount)} total sales
          </p>
          {farmerName && <p className="text-sm opacity-90">Stock from {farmerName}: {totalBagsReceived} bags</p>}
        </div>
        <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">Commission ({commissionPct}%)</span><span className="font-bold">{fmt(commissionAmount)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">Farmer payment</span><span className="font-bold">{fmt(farmerPayment)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">Leftover stock</span><span className="font-bold">{leftoverBags} bags · {fmt(leftoverWeight)} kg</span></div>
        </div>
        <button onClick={reset} className="w-full rounded-lg bg-[var(--bg-primary)] py-3 text-sm font-medium text-[var(--text-on-primary)]">
          New Entry
        </button>
      </div>
    );
  }

  // ─── Step Indicator ──────────────────────────────────────

  const steps = [
    { num: 1, label: 'Stock Received' },
    { num: 2, label: 'Sales' },
    { num: 3, label: 'Summary' },
  ];

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step >= s.num ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
            }`}>
              {step > s.num ? '✓' : s.num}
            </div>
            <span className={`text-xs ${step >= s.num ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className={`h-px w-4 ${step > s.num ? 'bg-[var(--bg-primary)]' : 'bg-[var(--border-input)]'}`} />}
          </div>
        ))}
      </div>

      {/* ─── Step 1: Stock Received ─────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
            <div>
              <label className="text-sm text-[var(--text-muted)]">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
            </div>

            <div>
              <label className="text-sm text-[var(--text-muted)]">Product *</label>
              <Autocomplete
                options={catalog}
                value={productName}
                onChange={setProductName}
                placeholder="e.g. Mirchi, Tomato, Onion"
              />
            </div>

            <div>
              <label className="text-sm text-[var(--text-muted)]">Farmer / Supplier</label>
              <Autocomplete
                options={farmers}
                value={farmerName}
                onChange={setFarmerName}
                placeholder="Farmer name (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-[var(--text-muted)]">Bags / Covers</label>
                <input type="number" value={bagsCovers} onChange={(e) => setBagsCovers(e.target.value)}
                  placeholder="0" inputMode="numeric"
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">Big Bags / Bastas</label>
                <input type="number" value={bigbags} onChange={(e) => setBigbags(e.target.value)}
                  placeholder="0" inputMode="numeric"
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
              </div>
            </div>

            {totalBagsReceived > 0 && (
              <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                Total: <span className="font-bold">{totalBagsReceived} bags</span>
              </div>
            )}
          </div>

          {/* Bag weight details */}
          <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Bag Details (weight & price)</p>
              <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <input type="checkbox" checked={samePrice} onChange={(e) => setSamePrice(e.target.checked)} />
                Same price for all
              </label>
            </div>

            {bagGroups.map((g, i) => (
              <div key={g.id} className="flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-muted)]">Weight (kg)</label>
                  <input type="number" value={g.weightKg} onChange={(e) => updateBagGroup(g.id, 'weightKg', e.target.value)}
                    placeholder="10" inputMode="decimal"
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
                <div className="w-20">
                  <label className="text-xs text-[var(--text-muted)]">Bags</label>
                  <input type="number" value={g.numBags} onChange={(e) => updateBagGroup(g.id, 'numBags', e.target.value)}
                    placeholder="50" inputMode="numeric"
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-muted)]">₹/kg</label>
                  <input type="number" value={g.pricePerKg} onChange={(e) => updateBagGroup(g.id, 'pricePerKg', e.target.value)}
                    placeholder="30" inputMode="decimal" disabled={samePrice && i > 0}
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm disabled:opacity-50" />
                </div>
                {bagGroups.length > 1 && (
                  <button onClick={() => removeBagGroup(g.id)}
                    className="rounded-lg bg-[var(--bg-secondary)] px-2 py-2 text-xs text-[var(--text-primary)]">✕</button>
                )}
              </div>
            ))}

            <button onClick={addBagGroup}
              className="w-full rounded-lg border border-dashed border-[var(--border-input)] py-2 text-sm text-[var(--text-muted)]">
              + Add another bag weight
            </button>

            {stockWeight > 0 && (
              <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                Total: <span className="font-bold">{stockWeight} kg</span>
                {stockValue > 0 && <span> · ₹{stockValue.toLocaleString('en-IN')}</span>}
              </div>
            )}
          </div>

          <button onClick={() => setStep(2)} disabled={!step1Valid}
            className="w-full rounded-lg bg-[var(--bg-primary)] py-3 text-sm font-medium text-[var(--text-on-primary)] disabled:opacity-50">
            Next: Record Sales →
          </button>
        </div>
      )}

      {/* ─── Step 2: Sales ──────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
            <p className="text-sm font-medium">Customer Sales</p>
            <p className="text-xs text-[var(--text-muted)]">Add a row for each customer who bought today.</p>

            {sales.map((s, i) => (
              <div key={s.id} className="rounded-lg border border-[var(--border-input)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-muted)]">#{i + 1}</span>
                  {sales.length > 1 && (
                    <button onClick={() => removeSale(s.id)}
                      className="text-xs text-[var(--text-primary)]">Remove</button>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[var(--text-muted)]">Customer name</label>
                  <Autocomplete
                    options={customers}
                    value={s.customerName}
                    onChange={(v) => updateSale(s.id, 'customerName', v)}
                    placeholder="e.g. Mangal Singh"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">Bags</label>
                    <input type="number" value={s.bags} onChange={(e) => updateSale(s.id, 'bags', e.target.value)}
                      placeholder="0" inputMode="numeric"
                      className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">Weight (kg)</label>
                    <input type="number" value={s.weightKg} onChange={(e) => updateSale(s.id, 'weightKg', e.target.value)}
                      placeholder="0" inputMode="decimal"
                      className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">₹/kg</label>
                    <input type="number" value={s.pricePerKg} onChange={(e) => updateSale(s.id, 'pricePerKg', e.target.value)}
                      placeholder="30" inputMode="decimal"
                      className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)]">Amount (₹)</label>
                    <input type="number" value={s.amount} onChange={(e) => updateSale(s.id, 'amount', e.target.value)}
                      placeholder="0" inputMode="numeric"
                      className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                  </div>
                </div>
              </div>
            ))}

            <button onClick={addSale}
              className="w-full rounded-lg border border-dashed border-[var(--border-input)] py-2 text-sm text-[var(--text-muted)]">
              + Add customer
            </button>

            {totalSalesAmount > 0 && (
              <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                Total sold: <span className="font-bold">{totalBagsSold} bags · {totalWeightSold} kg · ₹{totalSalesAmount.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)}
              className="flex-1 rounded-lg bg-[var(--bg-secondary)] py-3 text-sm font-medium text-[var(--text-primary)]">
              ← Back
            </button>
            <button onClick={() => setStep(3)} disabled={!step2Valid}
              className="flex-1 rounded-lg bg-[var(--bg-primary)] py-3 text-sm font-medium text-[var(--text-on-primary)] disabled:opacity-50">
              Next: Summary →
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Summary ────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Stock vs Sold */}
          <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
            <p className="text-sm font-medium">Stock Summary — {productName}</p>
            <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
              <div className="rounded-lg bg-[var(--bg-secondary)] p-2 sm:p-3">
                <p className="text-xl font-bold sm:text-2xl">{totalBagsReceived}</p>
                <p className="text-xs text-[var(--text-muted)]">Bags Received</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-secondary)] p-2 sm:p-3">
                <p className="text-xl font-bold sm:text-2xl">{totalBagsSold}</p>
                <p className="text-xs text-[var(--text-muted)]">Bags Sold</p>
              </div>
              <div className={`rounded-lg p-2 sm:p-3 ${leftoverBags < 0 ? 'bg-[var(--bg-error)]' : 'bg-[var(--bg-secondary)]'}`}>
                <p className="text-xl font-bold sm:text-2xl">{leftoverBags}</p>
                <p className="text-xs text-[var(--text-muted)]">Leftover</p>
              </div>
            </div>
            {leftoverBags < 0 && (
              <p className="text-xs text-[var(--bg-primary)]">⚠ Sold more bags than received — check numbers</p>
            )}
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div>
                <span className="text-[var(--text-muted)]">Weight received: </span>
                <span className="font-bold">{stockWeight} kg</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Weight sold: </span>
                <span className="font-bold">{totalWeightSold} kg</span>
              </div>
            </div>
          </div>

          {/* Financial summary */}
          <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
            <p className="text-sm font-medium">Financial Summary</p>

            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Total sales</span>
              <span className="font-bold text-lg">{fmt(totalSalesAmount)}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[var(--text-muted)]">Commission</span>
              <div className="flex items-center gap-1">
                <input type="number" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)}
                  inputMode="decimal" className="w-16 rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-1.5 text-sm text-right" />
                <span className="text-sm">%</span>
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Commission amount</span>
              <span className="font-bold">{fmt(commissionAmount)}</span>
            </div>

            <div className="border-t border-[var(--border-input)] pt-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Farmer payment</span>
                <span className="font-bold text-lg text-[var(--bg-success)]">{fmt(farmerPayment)}</span>
              </div>
            </div>
          </div>

          {/* Customer breakdown */}
          <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-2">
            <p className="text-sm font-medium">Customer Breakdown</p>
            {sales.filter((s) => s.customerName.trim()).map((s, i) => (
              <div key={s.id} className="flex justify-between text-sm">
                <span>{i + 1}. {s.customerName}</span>
                <span className="font-bold">{fmt(num(s.amount))}</span>
              </div>
            ))}
            <div className="border-t border-[var(--border-input)] pt-2 flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>{fmt(totalSalesAmount)}</span>
            </div>
          </div>

          {saveError && (
            <div className="rounded-lg bg-[var(--bg-error)] p-3 text-sm text-[var(--text-on-primary)]">
              {saveError}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(2)}
              className="flex-1 rounded-lg bg-[var(--bg-secondary)] py-3 text-sm font-medium text-[var(--text-primary)]">
              ← Back
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-lg bg-[var(--bg-success)] py-3 text-sm font-bold text-[var(--text-on-primary)] disabled:opacity-50">
              {saving ? 'Saving...' : '✓ Save All'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
