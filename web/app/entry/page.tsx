'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  return `id-${Date.now()}-${idCounter++}`;
}
function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

type RateUnit = 'per_kg' | 'per_10kg';
type CalcField = 'bags' | 'weight' | 'kgBag' | 'rate' | 'amount';
type StockField = 'bags' | 'kg' | 'avg';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toPerKg(entered: string, unit: RateUnit): number {
  const r = num(entered);
  if (r <= 0) return 0;
  return unit === 'per_10kg' ? r / 10 : r;
}

function fillStock(bags: string, kg: string, avg: string, changed: StockField): { bags: string; kg: string; avg: string } {
  let b = num(bags);
  let k = num(kg);
  let a = num(avg);
  if (changed === 'bags' || changed === 'avg') {
    if (b > 0 && a > 0) k = round2(b * a);
    else if (b > 0 && k > 0) a = round2(k / b);
  } else if (changed === 'kg') {
    if (b > 0 && k > 0) a = round2(k / b);
    else if (k > 0 && a > 0) b = round2(k / a);
  }
  return {
    bags: b > 0 ? String(b) : bags,
    kg: k > 0 ? String(k) : kg,
    avg: a > 0 ? String(a) : avg,
  };
}

function fillLine(line: Line, patch: Partial<Line>, kgBagDefault: number, unit: RateUnit, changed: CalcField): Line {
  const next: Line = { ...line, ...patch };
  if (changed === 'amount') return next;

  let bags = num(next.bags);
  let weight = num(next.weightKg);
  const kgBag = kgBagDefault;

  if (changed === 'bags' || changed === 'kgBag') {
    if (bags > 0 && kgBag > 0 && weight <= 0) weight = round2(bags * kgBag);
  } else if (changed === 'weight') {
    if (weight > 0 && kgBag > 0 && bags <= 0) bags = round2(weight / kgBag);
  }

  if (bags > 0) next.bags = String(bags);
  if (weight > 0) next.weightKg = String(weight);

  const perKg = toPerKg(next.pricePerKg, unit);
  const w = num(next.weightKg);
  if (w > 0 && perKg > 0) next.amount = String(Math.round(w * perKg));
  return next;
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

interface Lot {
  id: string;
  commodity: string;
  bags: string;
  kg: string;
  avg: string;
}

interface FarmerBlock {
  id: string;
  farmerName: string;
  hundekari: string;
  lots: Lot[];
  lines: Line[];
  commissionPct: string;
  hamaliTotal: string;
  bardan: string;
  freight: string;
  advance: string;
  packing: string;
  other: string;
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

function emptyLot(commodity = ''): Lot {
  return { id: newId(), commodity, bags: '', kg: '', avg: '' };
}

function emptyFarmer(commissionPct: string): FarmerBlock {
  return {
    id: newId(),
    farmerName: '',
    hundekari: '',
    lots: [emptyLot()],
    lines: [emptyLine()],
    commissionPct,
    hamaliTotal: '',
    bardan: '',
    freight: '',
    advance: '',
    packing: '',
    other: '',
  };
}

function itemKey(name: string) {
  return name.trim().toLowerCase();
}

const inputCls =
  'min-h-11 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-base tabular-nums sm:text-sm';

export default function EntryPage() {
  const { t } = useI18n();
  const [date, setDate] = usePersistentState('entry-date', today());
  const [rateUnit, setRateUnit] = useState<RateUnit>('per_10kg');
  const [commissionPct, setCommissionPct] = useState('10');
  const [blocks, setBlocks] = useState<FarmerBlock[]>(() => [emptyFarmer('10')]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState<FarmerPattiData[] | null>(null);

  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [farmerNames, setFarmerNames] = useState<string[]>([]);
  const [shop, setShop] = useState<ShopProfile>({});
  const [showAddFarmer, setShowAddFarmer] = useState<string | null>(null);
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
      .then((d) => setFarmerNames((d.suppliers || []).map((s: { name: string }) => s.name)))
      .catch(() => {});
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        setShop({ shopName: s.shopName, shopAddress: s.shopAddress, shopPhone: s.shopPhone });
        if (s.commissionPct) {
          setCommissionPct(String(s.commissionPct));
          setBlocks((prev) =>
            prev.map((b) => (b.commissionPct === '10' ? { ...b, commissionPct: String(s.commissionPct) } : b)),
          );
        }
      })
      .catch(() => {});
  }, []);

  const customerNames = useMemo(() => customers.map((c) => c.name), [customers]);
  const cashCustomer = useMemo(
    () => customers.find((c) => c.name.toUpperCase() === 'CASH SALES') || null,
    [customers],
  );

  const patchBlock = (id: string, fn: (b: FarmerBlock) => FarmerBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? fn(b) : b)));
  };

  const lotAvg = (block: FarmerBlock, commodity: string) => {
    const lot = block.lots.find((l) => itemKey(l.commodity) === itemKey(commodity) && l.commodity.trim());
    return lot ? num(lot.avg) : 0;
  };

  const rememberItem = (name: string) => {
    const n = name.trim();
    if (!n) return;
    setCatalog((prev) => (prev.some((x) => itemKey(x) === itemKey(n)) ? prev : [...prev, n].sort()));
  };

  const handleAddFarmerName = async (blockId: string) => {
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
      setFarmerNames((prev) => [...prev, newFarmerName.trim()].sort());
      patchBlock(blockId, (b) => ({ ...b, farmerName: newFarmerName.trim() }));
      setShowAddFarmer(null);
      setNewFarmerName('');
      setNewFarmerPhone('');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add farmer');
    } finally {
      setAddingFarmer(false);
    }
  };

  const totalsOf = (block: FarmerBlock) => {
    const validLines = block.lines.filter((l) => l.customerName.trim() && num(l.amount) > 0);
    const gross = validLines.reduce((s, l) => s + num(l.amount), 0);
    const lineHamali = validLines.reduce((s, l) => s + num(l.hamali), 0);
    const comm = (gross * num(block.commissionPct)) / 100;
    const hamali = num(block.hamaliTotal) || lineHamali;
    const exp = comm + hamali + num(block.bardan) + num(block.freight) + num(block.advance) + num(block.packing) + num(block.other);
    const itemNames = new Set<string>();
    for (const lot of block.lots) if (lot.commodity.trim()) itemNames.add(itemKey(lot.commodity));
    for (const l of validLines) if (l.commodity.trim()) itemNames.add(itemKey(l.commodity));
    const tally = [...itemNames].map((key) => {
      const lot = block.lots.find((l) => itemKey(l.commodity) === key);
      const label = lot?.commodity.trim() || validLines.find((l) => itemKey(l.commodity) === key)?.commodity || key;
      const sold = validLines.filter((l) => itemKey(l.commodity) === key);
      const inBags = num(lot?.bags || '');
      const inKg = num(lot?.kg || '');
      const soldBags = sold.reduce((s, l) => s + num(l.bags), 0);
      const soldKg = sold.reduce((s, l) => s + num(l.weightKg), 0);
      return {
        item: label,
        inBags,
        inKg,
        soldBags,
        soldKg,
        leftBags: inBags > 0 ? round2(inBags - soldBags) : round2(-soldBags),
        leftKg: inKg > 0 ? round2(inKg - soldKg) : round2(-soldKg),
        oversold: (inBags > 0 && soldBags > inBags) || (inKg > 0 && soldKg > inKg),
      };
    });
    return { validLines, gross, comm, hamali, exp, nett: gross - exp, tally };
  };

  const toPatti = (block: FarmerBlock): FarmerPattiData => {
    const t = totalsOf(block);
    const leftBags = t.tally.reduce((s, r) => s + (r.inBags > 0 ? r.leftBags : 0), 0);
    const leftKg = t.tally.reduce((s, r) => s + (r.inKg > 0 ? r.leftKg : 0), 0);
    return {
      farmer: block.farmerName.trim(),
      date,
      lines: t.validLines.map((l) => ({
        commodity: l.commodity.trim(),
        qty: l.bags,
        customer: l.customerName.trim(),
        weight: l.weightKg,
        rate: l.pricePerKg,
        amount: num(l.amount),
        cash: l.cash,
      })),
      comm: t.comm,
      hamali: t.hamali,
      bardan: num(block.bardan),
      freight: num(block.freight),
      advance: num(block.advance),
      packing: num(block.packing),
      other: num(block.other),
      hundekari: block.hundekari.trim() || undefined,
      leftoverBags: leftBags || undefined,
      leftoverKg: leftKg || undefined,
    };
  };

  const ensureCatalog = async (names: string[]) => {
    const existing = new Set(catalog.map(itemKey));
    for (const name of names) {
      const n = name.trim();
      if (!n || existing.has(itemKey(n))) continue;
      await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      }).catch(() => {});
      existing.add(itemKey(n));
      rememberItem(n);
    }
  };

  const handleSave = async () => {
    const ready = blocks.filter((b) => b.farmerName.trim() && totalsOf(b).validLines.length > 0);
    if (ready.length === 0) {
      setSaveError('Enter a farmer and at least one customer sale.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const savedPattis: FarmerPattiData[] = [];
      for (const block of ready) {
        const tot = totalsOf(block);
        const itemNames = [
          ...block.lots.map((l) => l.commodity),
          ...tot.validLines.map((l) => l.commodity),
        ];
        await ensureCatalog(itemNames);

        const bills = tot.validLines.map((sale) => ({
          customerName: sale.customerName.trim(),
          customerId: sale.customerId,
          date,
          billNo: null,
          total: num(sale.amount),
          paymentType: sale.cash ? ('cash' as const) : ('credit' as const),
          items: [
            {
              raw_text: sale.commodity,
              confirmed_name: sale.commodity,
              qty: sale.weightKg || null,
              rate: toPerKg(sale.pricePerKg, rateUnit)
                ? String(round2(toPerKg(sale.pricePerKg, rateUnit)))
                : sale.pricePerKg || null,
              amount: num(sale.amount),
              display: `${sale.bags || 0} bags${sale.weightKg ? `, ${sale.weightKg} kg` : ''} @ ₹${sale.pricePerKg}/${rateUnit === 'per_10kg' ? '10kg' : 'kg'}`,
              kind: 'item' as const,
              chargeCode: null,
              farmer: block.farmerName.trim(),
              hamali: num(sale.hamali) || null,
              bags: num(sale.bags) || null,
            },
          ],
        }));

        const namedLots = block.lots.filter((l) => l.commodity.trim() && (num(l.kg) > 0 || num(l.bags) > 0));
        const purchaseItems = namedLots.length
          ? namedLots.map((l) => ({
              name: l.commodity.trim(),
              qty: l.kg || l.bags,
              rate: null,
              amount: tot.validLines
                .filter((s) => itemKey(s.commodity) === itemKey(l.commodity))
                .reduce((s, x) => s + num(x.amount), 0),
              kind: 'item' as const,
              chargeCode: null,
            }))
          : [...tot.validLines.reduce((map, sale) => {
              const key = sale.commodity.trim() || 'Item';
              const cur = map.get(key) || { kg: 0, bags: 0, amount: 0, rate: sale.pricePerKg };
              cur.kg += num(sale.weightKg);
              cur.bags += num(sale.bags);
              cur.amount += num(sale.amount);
              map.set(key, cur);
              return map;
            }, new Map<string, { kg: number; bags: number; amount: number; rate: string }>())].map(([name, v]) => ({
              name,
              qty: v.kg > 0 ? String(v.kg) : String(v.bags),
              rate: v.rate || null,
              amount: v.amount,
              kind: 'item' as const,
              chargeCode: null,
            }));

        const res = await fetch('/api/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bills,
            purchase: purchaseItems.length
              ? { date, supplier: block.farmerName.trim(), total: tot.gross, items: purchaseItems }
              : null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Save failed for ${block.farmerName}`);
        savedPattis.push(toPatti(block));
      }
      setSaved(savedPattis);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed — nothing was written');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setBlocks([emptyFarmer(commissionPct)]);
    setSaved(null);
    setSaveError('');
  };

  if (saved) {
    const grossAll = saved.reduce((s, p) => s + p.lines.reduce((a, l) => a + l.amount, 0), 0);
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl bg-[var(--bg-success)] p-5 text-center text-[var(--text-on-success)]">
          <p className="text-xl font-bold">Patti saved</p>
          <p className="mt-1 text-sm opacity-90">
            {saved.map((p) => p.farmer).join(', ')} · {fmt(grossAll)}
          </p>
        </div>
        {saved.map((p) => (
          <button
            key={p.farmer}
            type="button"
            onClick={() => printFarmerPatti(p, shop)}
            className="w-full rounded-lg bg-[var(--bg-secondary)] py-3 text-sm font-medium text-[var(--text-on-primary)]"
          >
            {t('printPatti')} — {p.farmer}
          </button>
        ))}
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-lg bg-[var(--bg-primary)] py-3 text-sm font-medium text-[var(--text-on-primary)]"
        >
          {t('newEntry')}
        </button>
      </div>
    );
  }

  const anySales = blocks.some((b) => totalsOf(b).validLines.length > 0);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold">{t('dataEntryTitle')}</h1>
        <p className="text-xs text-[var(--text-muted)]">{t('dataEntryHelp')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{t('rate')}</span>
          <button
            type="button"
            onClick={() => setRateUnit('per_10kg')}
            className={`min-h-11 rounded-md px-3 text-sm font-medium ${
              rateUnit === 'per_10kg'
                ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                : 'border border-[var(--border-input)] text-[var(--text-muted)]'
            }`}
          >
            {t('ratePer10kg')}
          </button>
          <button
            type="button"
            onClick={() => setRateUnit('per_kg')}
            className={`min-h-11 rounded-md px-3 text-sm font-medium ${
              rateUnit === 'per_kg'
                ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                : 'border border-[var(--border-input)] text-[var(--text-muted)]'
            }`}
          >
            {t('ratePerKg')}
          </button>
          <span className="w-full text-xs text-[var(--text-muted)] sm:w-auto">{t('wholesaleHint')}</span>
        </div>
      </div>

      {blocks.map((block, fi) => {
        const tot = totalsOf(block);
        const lotNames = block.lots.map((l) => l.commodity.trim()).filter(Boolean);
        const itemOptions = [...new Set([...catalog, ...lotNames])];
        return (
          <section key={block.id} className="space-y-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t('farmer')} {fi + 1}
              </p>
              {blocks.length > 1 && (
                <button
                  type="button"
                  onClick={() => setBlocks((prev) => prev.filter((b) => b.id !== block.id))}
                  className="min-h-11 px-2 text-sm text-[var(--text-muted)]"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-xs text-[var(--text-muted)]">{t('farmer')} *</label>
                <Autocomplete
                  options={farmerNames}
                  value={block.farmerName}
                  onChange={(v) => patchBlock(block.id, (b) => ({ ...b, farmerName: v }))}
                  placeholder="LOCAL, RSB…"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs text-[var(--text-muted)]">{t('hundekari')}</label>
                <input
                  value={block.hundekari}
                  onChange={(e) => patchBlock(block.id, (b) => ({ ...b, hundekari: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddFarmer((v) => (v === block.id ? null : block.id))}
              className="text-xs text-[var(--text-muted)] underline"
            >
              + {t('farmer')}
            </button>
            {showAddFarmer === block.id && (
              <div className="flex flex-wrap gap-2">
                <input value={newFarmerName} onChange={(e) => setNewFarmerName(e.target.value)} placeholder={t('farmer')} className={`${inputCls} max-w-xs`} />
                <input value={newFarmerPhone} onChange={(e) => setNewFarmerPhone(e.target.value)} placeholder={t('phone')} className={`${inputCls} max-w-[10rem]`} />
                <button type="button" onClick={() => handleAddFarmerName(block.id)} disabled={addingFarmer} className="rounded-md bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-on-primary)]">
                  {t('savePhone')}
                </button>
              </div>
            )}

            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('farmerItems')}</p>
            <p className="text-xs text-[var(--text-muted)]">{t('stockInHint')}</p>
            <div className="space-y-2">
              {block.lots.map((lot) => (
                <div key={lot.id} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 sm:grid-cols-8">
                  <Field label={t('commodity')} className="col-span-2 sm:col-span-3">
                    <Autocomplete
                      options={catalog}
                      value={lot.commodity}
                      onChange={(v) => {
                        rememberItem(v);
                        patchBlock(block.id, (b) => ({
                          ...b,
                          lots: b.lots.map((l) => (l.id === lot.id ? { ...l, commodity: v } : l)),
                          lines: b.lines.map((ln) =>
                            !ln.commodity.trim() && ln.id === b.lines[0]?.id ? { ...ln, commodity: v } : ln,
                          ),
                        }));
                      }}
                      placeholder="CHILLI, BEANS…"
                    />
                  </Field>
                  <Field label={`${t('bags')} in`} className="sm:col-span-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={lot.bags}
                      placeholder="200"
                      className={inputCls}
                      onChange={(e) => {
                        const s = fillStock(e.target.value, lot.kg, lot.avg, 'bags');
                        patchBlock(block.id, (b) => ({
                          ...b,
                          lots: b.lots.map((l) => (l.id === lot.id ? { ...l, ...s, commodity: l.commodity } : l)),
                        }));
                      }}
                    />
                  </Field>
                  <Field label={t('totalKgIn')} className="sm:col-span-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={lot.kg}
                      placeholder="3000"
                      className={inputCls}
                      onChange={(e) => {
                        const s = fillStock(lot.bags, e.target.value, lot.avg, 'kg');
                        patchBlock(block.id, (b) => ({
                          ...b,
                          lots: b.lots.map((l) => (l.id === lot.id ? { ...l, ...s, commodity: l.commodity } : l)),
                        }));
                      }}
                    />
                  </Field>
                  <Field label={t('avgKgBag')} className="sm:col-span-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={lot.avg}
                      placeholder="15"
                      className={inputCls}
                      onChange={(e) => {
                        const s = fillStock(lot.bags, lot.kg, e.target.value, 'avg');
                        patchBlock(block.id, (b) => ({
                          ...b,
                          lots: b.lots.map((l) => (l.id === lot.id ? { ...l, ...s, commodity: l.commodity } : l)),
                        }));
                      }}
                    />
                  </Field>
                  {block.lots.length > 1 && (
                    <button
                      type="button"
                      className="col-span-2 min-h-11 text-sm text-[var(--text-muted)] sm:col-span-1"
                      onClick={() => patchBlock(block.id, (b) => ({ ...b, lots: b.lots.filter((l) => l.id !== lot.id) }))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => patchBlock(block.id, (b) => ({ ...b, lots: [...b.lots, emptyLot()] }))}
              className="min-h-11 w-full rounded-md border border-dashed border-[var(--border-input)] text-sm text-[var(--text-muted)]"
            >
              + {t('addItem')}
            </button>

            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('farmerSales')}</p>
            <div className="space-y-2">
              {block.lines.map((line, i) => (
                <div key={line.id} className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      {t('customer')} #{i + 1}
                    </span>
                    {block.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => patchBlock(block.id, (b) => ({ ...b, lines: b.lines.filter((l) => l.id !== line.id) }))}
                        className="min-h-11 min-w-11 text-sm text-[var(--text-muted)]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                    <Field label={t('commodity')} className="col-span-2 min-w-0 sm:min-w-[10rem] sm:flex-[2]">
                      <Autocomplete
                        options={itemOptions}
                        value={line.commodity}
                        onChange={(v) => {
                          rememberItem(v);
                          patchBlock(block.id, (b) => ({
                            ...b,
                            lines: b.lines.map((l) =>
                              l.id === line.id ? fillLine(l, { commodity: v }, lotAvg({ ...b, lines: b.lines }, v), rateUnit, 'kgBag') : l,
                            ),
                          }));
                        }}
                        placeholder="CHILLI, BEANS…"
                      />
                    </Field>
                    <Field label={t('customer')} className="col-span-2 min-w-0 sm:min-w-[10rem] sm:flex-[2]">
                      <Autocomplete
                        options={customerNames}
                        value={line.customerName}
                        onChange={(v) => {
                          const match = customers.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
                          const isCash = v.trim().toUpperCase() === 'CASH SALES' || v.trim().toUpperCase() === 'CASH SALE ACOUNT';
                          patchBlock(block.id, (b) => ({
                            ...b,
                            lines: b.lines.map((l) =>
                              l.id === line.id
                                ? {
                                    ...l,
                                    customerName: v,
                                    customerId: match?.id || (isCash ? cashCustomer?.id || null : null),
                                    cash: isCash,
                                  }
                                : l,
                            ),
                          }));
                        }}
                        placeholder="Name or CASH SALES"
                      />
                    </Field>
                    <Field label={t('qty')} className="min-w-0 sm:w-20">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={line.bags}
                        placeholder="0"
                        className={inputCls}
                        onChange={(e) =>
                          patchBlock(block.id, (b) => ({
                            ...b,
                            lines: b.lines.map((l) =>
                              l.id === line.id ? fillLine(l, { bags: e.target.value }, lotAvg(b, l.commodity), rateUnit, 'bags') : l,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <Field label={t('weightKg')} className="min-w-0 sm:w-24">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={line.weightKg}
                        placeholder="0"
                        className={inputCls}
                        onChange={(e) =>
                          patchBlock(block.id, (b) => ({
                            ...b,
                            lines: b.lines.map((l) =>
                              l.id === line.id ? fillLine(l, { weightKg: e.target.value }, lotAvg(b, l.commodity), rateUnit, 'weight') : l,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <Field label={rateUnit === 'per_10kg' ? t('ratePer10kg') : t('ratePerKg')} className="min-w-0 sm:w-28">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={line.pricePerKg}
                        placeholder={rateUnit === 'per_10kg' ? '220' : '22'}
                        className={inputCls}
                        onChange={(e) =>
                          patchBlock(block.id, (b) => ({
                            ...b,
                            lines: b.lines.map((l) =>
                              l.id === line.id ? fillLine(l, { pricePerKg: e.target.value }, lotAvg(b, l.commodity), rateUnit, 'rate') : l,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <Field label={t('amt')} className="min-w-0 sm:w-28">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={line.amount}
                        className={`${inputCls} font-semibold`}
                        onChange={(e) =>
                          patchBlock(block.id, (b) => ({
                            ...b,
                            lines: b.lines.map((l) =>
                              l.id === line.id ? fillLine(l, { amount: e.target.value }, lotAvg(b, l.commodity), rateUnit, 'amount') : l,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => {
                        const name = cashCustomer?.name || 'CASH SALES';
                        patchBlock(block.id, (b) => ({
                          ...b,
                          lines: b.lines.map((l) =>
                            l.id === line.id
                              ? l.cash
                                ? { ...l, cash: false }
                                : { ...l, cash: true, customerName: name, customerId: cashCustomer?.id || null }
                              : l,
                          ),
                        }));
                      }}
                      className={`col-span-1 min-h-11 w-full rounded-md px-3 text-sm font-medium sm:w-auto ${
                        line.cash
                          ? 'bg-[var(--bg-success)] text-[var(--text-on-success)]'
                          : 'border border-[var(--border-input)] text-[var(--text-muted)]'
                      }`}
                    >
                      {line.cash ? t('cashSale') : t('creditSale')}
                    </button>
                    <Field label={t('hamali')} className="min-w-0 sm:w-24">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={line.hamali}
                        className={inputCls}
                        onChange={(e) =>
                          patchBlock(block.id, (b) => ({
                            ...b,
                            lines: b.lines.map((l) => (l.id === line.id ? { ...l, hamali: e.target.value } : l)),
                          }))
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const last = block.lines[block.lines.length - 1];
                const fallback = lotNames[0] || '';
                patchBlock(block.id, (b) => ({
                  ...b,
                  lines: [...b.lines, emptyLine(last?.commodity || fallback, last?.pricePerKg || '')],
                }));
              }}
              className="min-h-11 w-full rounded-md border border-dashed border-[var(--border-input)] text-sm text-[var(--text-muted)]"
            >
              + {t('addLine')}
            </button>

            {tot.tally.length > 0 && (
              <div className="space-y-1 rounded-lg bg-[var(--bg-base)] p-2 text-xs">
                {tot.tally.map((row) => (
                  <p key={row.item} className={row.oversold ? 'text-[var(--bg-danger)]' : 'text-[var(--text-muted)]'}>
                    <span className="font-medium text-[var(--text-primary)]">{row.item}</span>
                    {' · '}
                    {t('stockReceived')} {row.inBags} {t('bags')} / {row.inKg} kg
                    {' · sold '}
                    {row.soldBags} / {row.soldKg} kg
                    {' · '}
                    {t('leftover')} {row.leftBags} {t('bags')} / {row.leftKg} kg
                    {row.oversold ? ' ⚠' : ''}
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <ChargeBox label={`${t('commission')} %`} value={block.commissionPct} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, commissionPct: v }))} suffix={`${fmt(tot.comm)}`} />
              <ChargeBox label={t('hamali')} value={block.hamaliTotal} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, hamaliTotal: v }))} placeholder={tot.validLines.length ? String(tot.validLines.reduce((s, l) => s + num(l.hamali), 0) || '') : '0'} />
              <ChargeBox label={t('chargesBardan')} value={block.bardan} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, bardan: v }))} />
              <ChargeBox label={t('chargesFreight')} value={block.freight} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, freight: v }))} />
              <ChargeBox label={t('chargesAdvance')} value={block.advance} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, advance: v }))} />
              <ChargeBox label={t('chargesPacking')} value={block.packing} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, packing: v }))} />
              <ChargeBox label={t('chargesOther')} value={block.other} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, other: v }))} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[var(--bg-base)] p-2">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('grossSale')}</p>
                <p className="text-lg font-bold">{fmt(tot.gross)}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-base)] p-2">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">Exp</p>
                <p className="text-lg font-bold">{fmt(tot.exp)}</p>
              </div>
              <div className="rounded-lg bg-[var(--bg-base)] p-2">
                <p className="text-[10px] uppercase text-[var(--text-muted)]">{t('nettSale')}</p>
                <p className="text-lg font-bold text-[var(--bg-success)]">{fmt(tot.nett)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => printFarmerPatti(toPatti(block), shop)}
              disabled={tot.validLines.length === 0}
              className="min-h-11 w-full rounded-lg border border-[var(--border-input)] text-sm disabled:opacity-40"
            >
              {t('printPatti')} — {block.farmerName || t('farmer')}
            </button>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => setBlocks((prev) => [...prev, emptyFarmer(commissionPct)])}
        className="min-h-11 w-full rounded-xl border border-dashed border-[var(--border-input)] text-sm text-[var(--text-muted)]"
      >
        + {t('addFarmer')}
      </button>

      {saveError && (
        <p className="rounded-lg bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--text-on-primary)]" role="alert">
          {saveError}
        </p>
      )}

      <div className="fixed bottom-[calc(3.25rem+env(safe-area-inset-bottom))] left-0 right-0 z-20 border-t border-[var(--border-light)] bg-[var(--bg-base)] px-3 py-2 lg:static lg:rounded-xl lg:border">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !anySales}
          className="min-h-12 w-full rounded-lg bg-[var(--bg-success)] text-sm font-bold text-[var(--text-on-success)] disabled:opacity-50"
        >
          {saving ? t('saving') : t('savePatti')}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{label}</label>
      {children}
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
