'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../components/usePersistentState';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import Autocomplete from '../components/Autocomplete';
import { printFarmerPatti, type FarmerPattiData, type ShopProfile } from '@/lib/billPrint';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let idCounter = 0;
function newId() {
  return `ln-${Date.now()}-${idCounter++}`;
}
function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

interface Line {
  id: string;
  commodity: string;
  bags: string;
  customerName: string;
  customerId: string | null;
  weightKg: string;
  pricePerKg: string;
  amount: string;
  cash: boolean;
  hamali: string;
}

interface CustomerOpt {
  id: string;
  name: string;
}

function emptyLine(commodity = '', price = ''): Line {
  return {
    id: newId(),
    commodity,
    bags: '',
    customerName: '',
    customerId: null,
    weightKg: '',
    pricePerKg: price,
    amount: '',
    cash: false,
    hamali: '',
  };
}

const inputCls =
  'w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-sm tabular-nums';

export default function EntryPage() {
  const { t } = useI18n();
  const [date, setDate] = usePersistentState('entry-date', today());
  const [farmerName, setFarmerName] = useState('');
  const [kgPerBag, setKgPerBag] = useState('');
  const [bagsReceived, setBagsReceived] = useState('');
  const [hundekari, setHundekari] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const [commissionPct, setCommissionPct] = useState('10');
  const [hamaliTotal, setHamaliTotal] = useState('');
  const [bardan, setBardan] = useState('');
  const [freight, setFreight] = useState('');
  const [advance, setAdvance] = useState('');
  const [packing, setPacking] = useState('');
  const [other, setOther] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState<FarmerPattiData | null>(null);

  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [farmers, setFarmers] = useState<string[]>([]);
  const [shop, setShop] = useState<ShopProfile>({});
  const [showAddFarmer, setShowAddFarmer] = useState(false);
  const [newFarmerName, setNewFarmerName] = useState('');
  const [newFarmerPhone, setNewFarmerPhone] = useState('');
  const [addingFarmer, setAddingFarmer] = useState(false);

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []))
      .catch(() => {});
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => setCatalog((d.items || []).map((i: { name: string }) => i.name).filter(Boolean)))
      .catch(() => {});
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => setFarmers((d.suppliers || []).map((s: { name: string }) => s.name)))
      .catch(() => {});
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        setShop({ shopName: s.shopName, shopAddress: s.shopAddress, shopPhone: s.shopPhone });
        if (s.commissionPct) setCommissionPct(String(s.commissionPct));
      })
      .catch(() => {});
  }, []);

  const customerNames = useMemo(() => customers.map((c) => c.name), [customers]);
  const cashCustomer = useMemo(
    () => customers.find((c) => c.name.toUpperCase() === 'CASH SALES') || null,
    [customers],
  );

  const validLines = lines.filter((l) => l.customerName.trim() && num(l.amount) > 0);
  const totalBagsSold = validLines.reduce((s, l) => s + num(l.bags), 0);
  const totalWeightSold = validLines.reduce((s, l) => s + num(l.weightKg), 0);
  const gross = validLines.reduce((s, l) => s + num(l.amount), 0);
  const lineHamali = validLines.reduce((s, l) => s + num(l.hamali), 0);
  const comm = (gross * num(commissionPct)) / 100;
  const hamali = num(hamaliTotal) || lineHamali;
  const exp = comm + hamali + num(bardan) + num(freight) + num(advance) + num(packing) + num(other);
  const nett = gross - exp;
  const leftover = num(bagsReceived) > 0 ? num(bagsReceived) - totalBagsSold : 0;

  const updateLine = (id: string, patch: Partial<Line>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.bags !== undefined && num(kgPerBag) > 0 && !patch.weightKg) {
          next.weightKg = String(Math.round(num(next.bags) * num(kgPerBag) * 100) / 100);
        }
        if (patch.bags !== undefined || patch.weightKg !== undefined || patch.pricePerKg !== undefined) {
          const amt = num(next.weightKg) * num(next.pricePerKg);
          next.amount = amt > 0 ? String(Math.round(amt)) : next.amount;
        }
        return next;
      }),
    );
  };

  const setCustomerOnLine = (id: string, name: string) => {
    const match = customers.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    const isCash = name.trim().toUpperCase() === 'CASH SALES' || name.trim().toUpperCase() === 'CASH SALE ACOUNT';
    updateLine(id, {
      customerName: name,
      customerId: match?.id || (isCash ? cashCustomer?.id || null : null),
      cash: isCash,
    });
  };

  const markCash = (id: string) => {
    const name = cashCustomer?.name || 'CASH SALES';
    updateLine(id, {
      cash: true,
      customerName: name,
      customerId: cashCustomer?.id || null,
    });
  };

  const addLine = () => {
    const last = lines[lines.length - 1];
    setLines([...lines, emptyLine(last?.commodity || '', last?.pricePerKg || '')]);
  };

  const handleAddFarmer = async () => {
    if (!newFarmerName.trim()) return;
    setAddingFarmer(true);
    try {
      const r = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: newFarmerName.trim(),
          phone: newFarmerPhone.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setFarmers((prev) => [...prev, newFarmerName.trim()].sort());
      setFarmerName(newFarmerName.trim());
      setShowAddFarmer(false);
      setNewFarmerName('');
      setNewFarmerPhone('');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add farmer');
    } finally {
      setAddingFarmer(false);
    }
  };

  const toPatti = (): FarmerPattiData => ({
    farmer: farmerName.trim(),
    date,
    lines: validLines.map((l) => ({
      commodity: l.commodity.trim(),
      qty: l.bags,
      customer: l.customerName.trim(),
      weight: l.weightKg,
      rate: l.pricePerKg,
      amount: num(l.amount),
      cash: l.cash,
    })),
    comm,
    hamali,
    bardan: num(bardan),
    freight: num(freight),
    advance: num(advance),
    packing: num(packing),
    other: num(other),
    hundekari: hundekari.trim() || undefined,
    leftoverBags: leftover || undefined,
  });

  const handleSave = async () => {
    if (!farmerName.trim()) {
      setSaveError('Enter the farmer name first.');
      return;
    }
    if (validLines.length === 0) {
      setSaveError('Add at least one customer sale.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      for (const sale of validLines) {
        const items = [
          {
            raw_text: sale.commodity,
            confirmed_name: sale.commodity,
            qty: sale.weightKg ? `${sale.weightKg} kg` : sale.bags ? `${sale.bags} bags` : '',
            rate: sale.pricePerKg || null,
            amount: num(sale.amount),
            display: `${sale.bags || 0} bags${sale.weightKg ? `, ${sale.weightKg} kg` : ''} @ ₹${sale.pricePerKg}/kg`,
            kind: 'item' as const,
            chargeCode: null,
            farmer: farmerName.trim(),
            hamali: num(sale.hamali) || null,
            bags: num(sale.bags) || null,
          },
        ];
        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: sale.customerName.trim(),
            customerId: sale.customerId,
            date,
            billNo: null,
            total: num(sale.amount),
            items,
            paymentType: sale.cash ? 'cash' : 'credit',
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to save ${sale.customerName}`);
        }
      }

      const byCommodity = new Map<string, { kg: number; bags: number; amount: number; rate: string }>();
      for (const sale of validLines) {
        const key = sale.commodity.trim() || 'Item';
        const cur = byCommodity.get(key) || { kg: 0, bags: 0, amount: 0, rate: sale.pricePerKg };
        cur.kg += num(sale.weightKg);
        cur.bags += num(sale.bags);
        cur.amount += num(sale.amount);
        byCommodity.set(key, cur);
      }
      const purchaseItems = [...byCommodity.entries()].map(([name, v]) => ({
        name,
        qty: v.kg > 0 ? `${v.kg} kg` : `${v.bags} bags`,
        rate: v.rate || null,
        amount: v.amount,
        kind: 'item' as const,
        chargeCode: null,
      }));
      if (purchaseItems.length > 0) {
        const pr = await fetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            supplier: farmerName.trim(),
            total: gross,
            items: purchaseItems,
          }),
        });
        if (!pr.ok) {
          const data = await pr.json();
          throw new Error(data.error || 'Saved sales, but farmer stock failed');
        }
      }
      setSaved(toPatti());
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setFarmerName('');
    setKgPerBag('');
    setBagsReceived('');
    setHundekari('');
    setLines([emptyLine()]);
    setHamaliTotal('');
    setBardan('');
    setFreight('');
    setAdvance('');
    setPacking('');
    setOther('');
    setSaved(null);
    setSaveError('');
  };

  if (saved) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl bg-[var(--bg-success)] p-5 text-center text-[var(--text-on-success)]">
          <p className="text-xl font-bold">Patti saved</p>
          <p className="mt-1 text-sm opacity-90">
            {saved.farmer} · {saved.lines.length} sales · {fmt(gross)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">{t('grossSale')}</span><span className="font-bold">{fmt(gross)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">{t('commission')} {commissionPct}%</span><span>{fmt(comm)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">{t('hamali')}</span><span>{fmt(hamali)}</span></div>
          <div className="flex justify-between border-t border-[var(--border-input)] pt-2"><span className="font-medium">{t('nettSale')}</span><span className="text-lg font-bold">{fmt(nett)}</span></div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => printFarmerPatti(saved, shop)}
            className="flex-1 rounded-lg bg-[var(--bg-secondary)] py-3 text-sm font-medium text-[var(--text-on-primary)]"
          >
            {t('printPatti')}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-lg bg-[var(--bg-primary)] py-3 text-sm font-medium text-[var(--text-on-primary)]"
          >
            {t('newEntry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold">{t('dataEntryTitle')}</h1>
        <p className="text-xs text-[var(--text-muted)]">{t('dataEntryHelp')}</p>
      </div>

      <section className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--text-muted)]">{t('farmer')} *</label>
            <Autocomplete options={farmers} value={farmerName} onChange={setFarmerName} placeholder="LOCAL, RSB…" />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">kg / bag</label>
            <input type="number" inputMode="decimal" value={kgPerBag} onChange={(e) => setKgPerBag(e.target.value)} placeholder="20" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('bags')} in</label>
            <input type="number" inputMode="numeric" value={bagsReceived} onChange={(e) => setBagsReceived(e.target.value)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('hundekari')}</label>
            <input value={hundekari} onChange={(e) => setHundekari(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button type="button" onClick={() => setShowAddFarmer((v) => !v)} className="mt-2 text-xs text-[var(--text-muted)] underline">
          + {t('farmer')}
        </button>
        {showAddFarmer && (
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={newFarmerName} onChange={(e) => setNewFarmerName(e.target.value)} placeholder={t('farmer')} className={`${inputCls} max-w-xs`} />
            <input value={newFarmerPhone} onChange={(e) => setNewFarmerPhone(e.target.value)} placeholder={t('phone')} className={`${inputCls} max-w-[10rem]`} />
            <button type="button" onClick={handleAddFarmer} disabled={addingFarmer} className="rounded-md bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-on-primary)]">
              {t('savePhone')}
            </button>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]">
        <div className="hidden border-b border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)] lg:grid lg:grid-cols-[1.3fr_4.5rem_1.4fr_5.5rem_5.5rem_6rem_4.5rem_2.5rem_2rem] lg:gap-2">
          <span>{t('commodity')}</span>
          <span>{t('qty')}</span>
          <span>{t('customer')}</span>
          <span>{t('weightKg')}</span>
          <span>{t('ratePerKg')}</span>
          <span>{t('amt')}</span>
          <span />
          <span>{t('hamali')}</span>
          <span />
        </div>

        <div className="divide-y divide-[var(--border-input)]">
          {lines.map((line, i) => (
            <div key={line.id} className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-[1.3fr_4.5rem_1.4fr_5.5rem_5.5rem_6rem_4.5rem_2.5rem_2rem] lg:items-end lg:gap-2">
              <div className="col-span-2 lg:col-span-1">
                <label className="text-[10px] text-[var(--text-muted)] lg:hidden">{t('commodity')}</label>
                <Autocomplete
                  options={catalog}
                  value={line.commodity}
                  onChange={(v) => updateLine(line.id, { commodity: v })}
                  placeholder="OSURI, BODA…"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] lg:hidden">{t('qty')}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={line.bags}
                  onChange={(e) => updateLine(line.id, { bags: e.target.value })}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2 lg:col-span-1">
                <label className="text-[10px] text-[var(--text-muted)] lg:hidden">{t('customer')}</label>
                <Autocomplete
                  options={customerNames}
                  value={line.customerName}
                  onChange={(v) => setCustomerOnLine(line.id, v)}
                  placeholder="Name or CASH SALES"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] lg:hidden">{t('weightKg')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={line.weightKg}
                  onChange={(e) => updateLine(line.id, { weightKg: e.target.value })}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] lg:hidden">{t('ratePerKg')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={line.pricePerKg}
                  onChange={(e) => updateLine(line.id, { pricePerKg: e.target.value })}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] lg:hidden">{t('amt')}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={line.amount}
                  onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                  className={`${inputCls} font-semibold`}
                />
              </div>
              <button
                type="button"
                onClick={() => (line.cash ? updateLine(line.id, { cash: false }) : markCash(line.id))}
                className={`rounded-md px-2 py-2 text-[11px] font-medium ${
                  line.cash
                    ? 'bg-[var(--bg-success)] text-[var(--text-on-success)]'
                    : 'border border-[var(--border-input)] text-[var(--text-muted)]'
                }`}
              >
                {line.cash ? t('cashSale') : t('creditSale')}
              </button>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] lg:hidden">{t('hamali')}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={line.hamali}
                  onChange={(e) => updateLine(line.id, { hamali: e.target.value })}
                  className={inputCls}
                />
              </div>
              {lines.length > 1 ? (
                <button type="button" onClick={() => setLines(lines.filter((l) => l.id !== line.id))} className="text-xs text-[var(--text-muted)]" aria-label="Remove line">
                  ✕
                </button>
              ) : (
                <span className="text-[10px] text-[var(--text-faint)]">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="w-full border-t border-dashed border-[var(--border-input)] py-2.5 text-sm text-[var(--text-muted)]">
          + {t('addLine')}
        </button>
      </section>

      <section className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <ChargeBox label={`${t('commission')} %`} value={commissionPct} onChange={setCommissionPct} suffix={`${fmt(comm)}`} />
          <ChargeBox label={t('hamali')} value={hamaliTotal} onChange={setHamaliTotal} placeholder={lineHamali ? String(lineHamali) : '0'} />
          <ChargeBox label={t('chargesBardan')} value={bardan} onChange={setBardan} />
          <ChargeBox label={t('chargesFreight')} value={freight} onChange={setFreight} />
          <ChargeBox label={t('chargesAdvance')} value={advance} onChange={setAdvance} />
          <ChargeBox label={t('chargesPacking')} value={packing} onChange={setPacking} />
          <ChargeBox label={t('chargesOther')} value={other} onChange={setOther} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[var(--bg-base)] p-2">
            <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('grossSale')}</p>
            <p className="text-lg font-bold">{fmt(gross)}</p>
            <p className="text-[10px] text-[var(--text-faint)]">{totalBagsSold} bags · {totalWeightSold} kg</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-base)] p-2">
            <p className="text-[10px] uppercase text-[var(--text-muted)]">Exp</p>
            <p className="text-lg font-bold">{fmt(exp)}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-base)] p-2">
            <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('nettSale')}</p>
            <p className="text-lg font-bold text-[var(--bg-success)]">{fmt(nett)}</p>
            {num(bagsReceived) > 0 && (
              <p className={`text-[10px] ${leftover < 0 ? 'text-[var(--bg-danger)]' : 'text-[var(--text-faint)]'}`}>
                {t('leftover')}: {leftover} bags
              </p>
            )}
          </div>
        </div>
      </section>

      {saveError && (
        <p className="rounded-lg bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--text-on-primary)]" role="alert">
          {saveError}
        </p>
      )}

      <div className="flex gap-2 pb-4">
        <button
          type="button"
          onClick={() => printFarmerPatti(toPatti(), shop)}
          disabled={validLines.length === 0}
          className="flex-1 rounded-lg border border-[var(--border-input)] py-3 text-sm font-medium disabled:opacity-40"
        >
          {t('printPatti')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-[2] rounded-lg bg-[var(--bg-success)] py-3 text-sm font-bold text-[var(--text-on-success)] disabled:opacity-50"
        >
          {saving ? t('saving') : t('savePatti')}
        </button>
      </div>
    </div>
  );
}

function ChargeBox({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-[var(--text-muted)]">{label}</label>
      <input type="number" inputMode="decimal" value={value} placeholder={placeholder || '0'} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      {suffix && <p className="text-[10px] text-[var(--text-faint)]">{suffix}</p>}
    </div>
  );
}
