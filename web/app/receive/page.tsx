'use client';

import { useState, useEffect } from 'react';
import { usePersistentState } from '../components/usePersistentState';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let idCounter = 0;
function newId() { return `r-${Date.now()}-${idCounter++}`; }
function num(s: string): number { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; }

import { BagGroup } from '@/lib/types';
import { Charge, CHARGE_TYPES } from '@/lib/charges';

export default function ReceivePage() {
  const { t } = useI18n();
  const [date, setDate] = usePersistentState('receive-date', today());
  const [productName, setProductName] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [bagsCovers, setBagsCovers] = useState('');
  const [bigbags, setBigbags] = useState('');
  const [bagGroups, setBagGroups] = useState<BagGroup[]>([
    { id: newId(), weightKg: '', numBags: '', pricePerKg: '' },
  ]);
  const [samePrice, setSamePrice] = useState(true);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [showCharges, setShowCharges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const [catalog, setCatalog] = useState<string[]>([]);
  const [farmers, setFarmers] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/catalog').then((r) => r.json()).then((d) => setCatalog((d.items || []).map((i: any) => i.name))).catch(() => {});
    fetch('/api/suppliers').then((r) => r.json()).then((d) => setFarmers((d.suppliers || []).map((s: any) => s.name))).catch(() => {});
  }, []);

  const totalBagsReceived = num(bagsCovers) + num(bigbags);
  const stockWeight = bagGroups.reduce((s, g) => s + num(g.weightKg) * num(g.numBags), 0);
  const stockValue = bagGroups.reduce((s, g) => s + num(g.weightKg) * num(g.numBags) * num(g.pricePerKg), 0);

  // Calculate charge amounts
  const totalBags = bagGroups.reduce((s, g) => s + num(g.numBags), 0);
  const chargeAmounts = charges.map((c) => {
    if (c.rateType === 'per_bag') return num(c.rate) * totalBags;
    if (c.rateType === 'percent') return (stockValue * num(c.rate)) / 100;
    return num(c.amount) || num(c.rate);
  });
  const totalCharges = chargeAmounts.reduce((s, a) => s + a, 0);
  const netToFarmer = stockValue - totalCharges;

  const addBagGroup = () => {
    const lastPrice = samePrice && bagGroups.length > 0 ? bagGroups[0].pricePerKg : '';
    setBagGroups([...bagGroups, { id: newId(), weightKg: '', numBags: '', pricePerKg: lastPrice }]);
  };
  const updateBagGroup = (id: string, field: keyof BagGroup, value: string) => {
    setBagGroups(bagGroups.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };
  const removeBagGroup = (id: string) => setBagGroups(bagGroups.filter((g) => g.id !== id));

  useEffect(() => {
    if (samePrice && bagGroups.length > 0) {
      const firstPrice = bagGroups[0].pricePerKg;
      setBagGroups(bagGroups.map((g, i) => (i === 0 ? g : { ...g, pricePerKg: firstPrice })));
    }
  }, [samePrice]);

  const addCharge = (type: Charge['type']) => {
    const def = CHARGE_TYPES.find((c) => c.type === type)!;
    setCharges([...charges, {
      id: newId(),
      type,
      label: def.label,
      rateType: def.defaultRateType,
      rate: '',
      amount: '',
    }]);
  };

  const updateCharge = (id: string, field: keyof Charge, value: string) => {
    setCharges(charges.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeCharge = (id: string) => setCharges(charges.filter((c) => c.id !== id));

  const canSave = productName.trim() && totalBagsReceived > 0 && farmerName.trim();

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const purchaseItems: Array<{
        name: string;
        qty: string | null;
        rate: string | null;
        amount: number;
        kind: 'item' | 'charge';
        chargeCode: null;
      }> = bagGroups
        .filter((g) => num(g.numBags) > 0)
        .map((g) => ({
          name: productName,
          qty: `${num(g.weightKg) * num(g.numBags)} kg`,
          rate: g.pricePerKg || null,
          amount: num(g.weightKg) * num(g.numBags) * num(g.pricePerKg),
          kind: 'item' as const,
          chargeCode: null as null,
        }));

      // Add charges as line items
      charges.forEach((c, i) => {
        const amt = chargeAmounts[i];
        if (amt > 0) {
          purchaseItems.push({
            name: c.label,
            qty: c.rateType === 'per_bag' ? `${c.rate}/bag × ${totalBags}` : c.rateType === 'percent' ? `${c.rate}%` : null,
            rate: null,
            amount: -amt,
            kind: 'charge' as const,
            chargeCode: null,
          });
        }
      });

      const total = stockValue - totalCharges;

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          supplier: farmerName.trim(),
          total,
          items: purchaseItems,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Save failed');
      }
      setSaved(true);
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setProductName(''); setFarmerName(''); setBagsCovers(''); setBigbags('');
    setBagGroups([{ id: newId(), weightKg: '', numBags: '', pricePerKg: '' }]);
    setCharges([]); setShowCharges(false);
    setSaved(false); setSaveError('');
  };

  if (saved) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-[var(--bg-success)] p-6 text-center text-[var(--text-on-primary)]">
          <p className="text-2xl font-bold">✓ Stock Received</p>
          <p className="mt-1 text-sm opacity-90">{productName} from {farmerName}</p>
          <p className="text-sm opacity-90">{totalBagsReceived} bags · {stockWeight} kg · Gross {fmt(stockValue)}</p>
          {totalCharges > 0 && (
            <p className="text-sm opacity-90">Deductions: {fmt(totalCharges)} · Net to farmer: {fmt(netToFarmer)}</p>
          )}
        </div>
        <button onClick={reset} className="w-full rounded-lg bg-[var(--bg-primary)] py-3 text-sm font-medium text-[var(--text-on-primary)]">
          Receive More Stock
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stock details */}
      <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
        <p className="text-sm font-medium">Receive Stock from Farmer</p>

        <div>
          <label className="text-sm text-[var(--text-muted)]">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
        </div>

        <div>
          <label className="text-sm text-[var(--text-muted)]">Product *</label>
          <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)}
            list="product-list" placeholder="e.g. Mirchi, Tomato, Onion"
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
          <datalist id="product-list">{catalog.map((c) => <option key={c} value={c} />)}</datalist>
        </div>

        <div>
          <label className="text-sm text-[var(--text-muted)]">Farmer / Supplier *</label>
          <input type="text" value={farmerName} onChange={(e) => setFarmerName(e.target.value)}
            list="farmer-list" placeholder="Farmer name"
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
          <datalist id="farmer-list">{farmers.map((f) => <option key={f} value={f} />)}</datalist>
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
          <div key={g.id} className="flex items-end gap-2">
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
            {stockValue > 0 && <span> · Gross {fmt(stockValue)}</span>}
          </div>
        )}
      </div>

      {/* Optional charges section */}
      <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
        <button onClick={() => setShowCharges(!showCharges)}
          className="flex w-full items-center justify-between text-sm font-medium">
          <span>Charges & Deductions {charges.length > 0 && `(${charges.length})`}</span>
          <span className="text-xs text-[var(--text-muted)]">{showCharges ? '▲' : '▼'} Optional</span>
        </button>

        {showCharges && (
          <>
            {charges.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">Add only the charges that apply to this sale. Skip what doesn't.</p>
            )}

            {charges.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-[var(--border-input)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{c.label}</span>
                  <button onClick={() => removeCharge(c.id)} className="text-xs text-[var(--text-primary)]">Remove</button>
                </div>
                <div className="flex items-end gap-2">
                  {c.rateType === 'per_bag' && (
                    <>
                      <div className="flex-1">
                        <label className="text-xs text-[var(--text-muted)]">₹ per bag</label>
                        <input type="number" value={c.rate} onChange={(e) => updateCharge(c.id, 'rate', e.target.value)}
                          placeholder="3" inputMode="decimal"
                          className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                      </div>
                      <div className="flex-1 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                        × {totalBags} bags = <span className="font-bold">{fmt(num(c.rate) * totalBags)}</span>
                      </div>
                    </>
                  )}
                  {c.rateType === 'percent' && (
                    <>
                      <div className="flex-1">
                        <label className="text-xs text-[var(--text-muted)]">%</label>
                        <input type="number" value={c.rate} onChange={(e) => updateCharge(c.id, 'rate', e.target.value)}
                          placeholder="6" inputMode="decimal"
                          className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                      </div>
                      <div className="flex-1 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                        {c.rate}% of {fmt(stockValue)} = <span className="font-bold">{fmt((stockValue * num(c.rate)) / 100)}</span>
                      </div>
                    </>
                  )}
                  {c.rateType === 'flat' && (
                    <div className="flex-1">
                      <label className="text-xs text-[var(--text-muted)]">₹ amount</label>
                      <input type="number" value={c.amount} onChange={(e) => updateCharge(c.id, 'amount', e.target.value)}
                        placeholder="100" inputMode="numeric"
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add charge buttons */}
            <div className="flex flex-wrap gap-1.5">
              {CHARGE_TYPES.filter((ct) => !charges.some((c) => c.type === ct.type)).map((ct) => (
                <button key={ct.type} onClick={() => addCharge(ct.type)}
                  title={ct.hint}
                  className="rounded-lg border border-dashed border-[var(--border-input)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--bg-primary)]">
                  + {ct.label}
                </button>
              ))}
            </div>

            {totalCharges > 0 && (
              <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Gross value</span>
                  <span>{fmt(stockValue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Total deductions</span>
                  <span className="text-[var(--bg-primary)]">-{fmt(totalCharges)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border-input)] pt-1 font-bold">
                  <span>Net to farmer</span>
                  <span className="text-[var(--bg-success)]">{fmt(netToFarmer)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {saveError && (
        <div className="rounded-lg bg-[var(--bg-error)] p-3 text-sm text-[var(--text-on-primary)]">{saveError}</div>
      )}

      <button onClick={handleSave} disabled={!canSave || saving}
        className="w-full rounded-lg bg-[var(--bg-success)] py-3 text-sm font-bold text-[var(--text-on-primary)] disabled:opacity-50">
        {saving ? 'Saving...' : '✓ Save Stock Received'}
      </button>
    </div>
  );
}
