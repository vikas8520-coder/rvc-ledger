'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePersistentState } from '../components/usePersistentState';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { fmt } from '@/lib/format';
import Autocomplete from '../components/Autocomplete';
import { printFarmerPatti, type FarmerPattiData, type ShopProfile } from '@/lib/billPrint';
import { PrinterIcon } from '../components/Icons';
import PrintShareMenu from '../components/PrintShareMenu';
import {
  generateOutstandingListPdf,
  generateCreditLedgerPdf,
  generateBillsPdf,
  printPdfBlob,
  sharePdfViaWhatsApp,
} from '@/lib/pdfShare';
import { txnToBillData, type CreditLedgerEntry } from '@/lib/billPrint';
import { sliceCustomer, rangeLabel } from '@/lib/dateRange';
import type { Customer } from '@/lib/types';

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
type CalcField = 'bags' | 'weight' | 'totalWeight' | 'rate' | 'amount';
type StockField = 'bags' | 'kg' | 'avg';

const MAX_SALE_BAGS = 80;

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

function resizeWeights(existing: string[] | undefined, count: number): string[] {
  const n = Math.max(0, Math.min(MAX_SALE_BAGS, Math.floor(count)));
  const next = (existing || []).slice(0, n);
  while (next.length < n) next.push('');
  return next;
}

function weightsTotal(weights: string[] | undefined): number {
  return round2((weights || []).reduce((s, w) => s + num(w), 0));
}

function fillLine(line: Line, patch: Partial<Line>, unit: RateUnit, changed: CalcField): Line {
  const next: Line = { ...line, ...patch };
  if (changed === 'bags') {
    const count = Math.max(0, Math.min(MAX_SALE_BAGS, Math.floor(num(next.bags))));
    next.bags = next.bags.trim() === '' ? '' : String(count);
    next.bagWeights = resizeWeights(next.bagWeights, count);
  } else {
    next.bagWeights = next.bagWeights ? [...next.bagWeights] : [];
  }
  // In total mode, weightKg is entered directly; in per-bag mode, it's summed
  if (changed === 'totalWeight') {
    // weightKg already set via patch; don't recompute from bagWeights
  } else if (next.weightMode === 'total') {
    // keep existing weightKg as-is
  } else {
    const total = weightsTotal(next.bagWeights);
    next.weightKg = total > 0 ? String(total) : '';
  }
  if (changed === 'amount') return next;
  const perKg = toPerKg(next.pricePerKg, unit);
  const w = num(next.weightKg);
  if (w > 0 && perKg > 0) next.amount = String(Math.round(w * perKg));
  return next;
}

interface Line {
  id: string;
  commodity: string;
  bags: string;
  bagWeights: string[];
  customerName: string;
  customerId: string | null;
  weightKg: string;
  weightMode: 'per_bag' | 'total';
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
  lines: Line[];
}

interface FarmerBlock {
  id: string;
  farmerName: string;
  farmerPhone: string;
  hundekari: string;
  lots: Lot[];
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
  englishName?: string | null;
  teluguName?: string | null;
  hindiName?: string | null;
}

interface SavedSale {
  txnId: string;
  customerId: string;
  farmer: string;
  commodity: string;
  customerName: string;
  bags: string;
  bagWeights: string[];
  weightKg: string;
  rate: string;
  amount: number;
  cash: boolean;
  hamali: string;
}

function emptyLine(commodity = '', price = ''): Line {
  return {
    id: newId(),
    commodity,
    bags: '',
    bagWeights: [],
    customerName: '',
    customerId: null,
    weightKg: '',
    weightMode: 'per_bag',
    pricePerKg: price,
    amount: '',
    cash: false,
    hamali: '',
  };
}

function emptyLot(commodity = ''): Lot {
  return { id: newId(), commodity, bags: '', kg: '', avg: '', lines: [emptyLine(commodity)] };
}

function linesOf(block: FarmerBlock): Line[] {
  return block.lots.flatMap((lot) =>
    lot.lines.map((ln) => ({ ...ln, commodity: lot.commodity.trim() || ln.commodity })),
  );
}

function emptyFarmer(commissionPct: string): FarmerBlock {
  return {
    id: newId(),
    farmerName: '',
    farmerPhone: '',
    hundekari: '',
    lots: [],
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
  'min-h-11 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-base text-[var(--text-primary)] tabular-nums sm:text-sm';

// Compact input for table rows and tight layouts
const smInput =
  'min-h-9 w-full rounded border border-[var(--border-input)] bg-[var(--bg-base)] px-1.5 py-1 text-xs text-[var(--text-primary)] tabular-nums';

export default function EntryPage() {
  const { t, lang } = useI18n();
  const uiLang = getUiLang(lang);
  const [date, setDate] = usePersistentState('entry-date', today());
  const [rateUnit, setRateUnit] = useState<RateUnit>('per_10kg');
  const [commissionPct, setCommissionPct] = useState('10');
  const [blocks, setBlocks] = usePersistentState<FarmerBlock[]>('entry-blocks', [emptyFarmer('10')]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedSales, setSavedSales] = useState<SavedSale[]>([]);
  const [savedPattis, setSavedPattis] = useState<FarmerPattiData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [stockPopoverId, setStockPopoverId] = useState<string | null>(null);
  const [weightsExpanded, setWeightsExpanded] = useState<Record<string, boolean>>({});

  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [farmerNames, setFarmerNames] = useState<string[]>([]);
  const [farmerPhones, setFarmerPhones] = useState<Record<string, string>>({});
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
      .then((d) => {
        const sups = d.suppliers || [];
        setFarmerNames(sups.map((s: { name: string }) => s.name).sort());
        const phoneMap: Record<string, string> = {};
        for (const s of sups) {
          if (s.phone) phoneMap[s.name] = s.phone;
        }
        setFarmerPhones(phoneMap);
      })
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

  // Keep activeTabId pointing at a valid block
  useEffect(() => {
    if (blocks.length === 0) return;
    if (!activeTabId || !blocks.some((b) => b.id === activeTabId)) {
      setActiveTabId(blocks[0].id);
    }
  }, [blocks, activeTabId]);

  // Keep selectedLotId pointing at a valid lot in the active block
  useEffect(() => {
    const active = blocks.find((b) => b.id === activeTabId);
    if (!active || active.lots.length === 0) {
      setSelectedLotId(null);
      return;
    }
    if (!selectedLotId || !active.lots.some((l) => l.id === selectedLotId)) {
      setSelectedLotId(active.lots[0].id);
    }
  }, [blocks, activeTabId, selectedLotId]);

  const customerNames = useMemo(() => customers.map((c) => formatCustomerName(c, uiLang)), [customers, uiLang]);
  const cashCustomer = useMemo(
    () => customers.find((c) => c.name.toUpperCase() === 'CASH SALES') || null,
    [customers],
  );

  const patchBlock = (id: string, fn: (b: FarmerBlock) => FarmerBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? fn(b) : b)));
  };

  const patchLot = (blockId: string, lotId: string, fn: (lot: Lot) => Lot) => {
    patchBlock(blockId, (b) => ({ ...b, lots: b.lots.map((l) => (l.id === lotId ? fn(l) : l)) }));
  };

  const patchLotLine = (blockId: string, lotId: string, lineId: string, fn: (ln: Line) => Line) => {
    patchLot(blockId, lotId, (lot) => ({
      ...lot,
      lines: lot.lines.map((ln) => (ln.id === lineId ? fn(ln) : ln)),
    }));
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
      if (newFarmerPhone.trim()) {
        setFarmerPhones((prev) => ({ ...prev, [newFarmerName.trim()]: newFarmerPhone.trim() }));
      }
      patchBlock(blockId, (b) => ({ ...b, farmerName: newFarmerName.trim(), farmerPhone: newFarmerPhone.trim() }));
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
    const validLines = linesOf(block).filter((l) => l.customerName.trim() && num(l.amount) > 0);
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

  // Warn user before leaving/refreshing if there's unsaved data
  const hasUnsavedData = useMemo(() => {
    return blocks.some(
      (b) => b.farmerName.trim() && totalsOf(b).validLines.length > 0,
    );
  }, [blocks]);

  useEffect(() => {
    if (!hasUnsavedData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedData]);

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

  // Fetch full customer data for dues/ledger/bills printing
  const fetchDashboardCustomers = async (): Promise<Customer[]> => {
    const res = await fetch('/api/dashboard');
    const d = await res.json();
    return d.customers || [];
  };

  const printDues = async () => {
    try {
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      printPdfBlob(generateOutstandingListPdf(sliced, shop, uiLang, rangeLabel(date, date)));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Print failed');
    }
  };

  const shareDues = async () => {
    try {
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      const blob = generateOutstandingListPdf(sliced, shop, uiLang, rangeLabel(date, date));
      await sharePdfViaWhatsApp(blob, `outstanding-${date}.pdf`, `${shop.shopName || 'RVC'} — Outstanding (${date})`);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Share failed');
    }
  };

  const printLedger = async () => {
    try {
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      const entries: CreditLedgerEntry[] = sliced
        .filter((c) => c.due > 0)
        .sort((a, b) => formatCustomerName(a, uiLang).localeCompare(formatCustomerName(b, uiLang)))
        .map((c, i) => ({
          code: String(i + 1),
          name: formatCustomerName(c, uiLang),
          phone: c.phone || undefined,
          amount: Math.round(c.due),
          isCredit: false,
        }));
      if (entries.length === 0) throw new Error('No outstanding on this date');
      printPdfBlob(generateCreditLedgerPdf(entries, shop, rangeLabel(date, date), 'All'));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Print failed');
    }
  };

  const shareLedger = async () => {
    try {
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      const entries: CreditLedgerEntry[] = sliced
        .filter((c) => c.due > 0)
        .sort((a, b) => formatCustomerName(a, uiLang).localeCompare(formatCustomerName(b, uiLang)))
        .map((c, i) => ({
          code: String(i + 1),
          name: formatCustomerName(c, uiLang),
          phone: c.phone || undefined,
          amount: Math.round(c.due),
          isCredit: false,
        }));
      if (entries.length === 0) throw new Error('No outstanding on this date');
      const blob = generateCreditLedgerPdf(entries, shop, rangeLabel(date, date), 'All');
      await sharePdfViaWhatsApp(blob, `credit-ledger-${date}.pdf`, `${shop.shopName || 'RVC'} — Credit Ledger (${date})`);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Share failed');
    }
  };

  const printBills = async () => {
    try {
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      const bills = sliced.flatMap((c) =>
        c.txns.filter((tx) => tx.type === 'bill').map((tx) => txnToBillData(tx, formatCustomerName(c, uiLang))),
      );
      if (bills.length === 0) throw new Error('No customer patti on this date');
      printPdfBlob(generateBillsPdf(bills, shop, 'patti'));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Print failed');
    }
  };

  const shareBills = async () => {
    try {
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      const bills = sliced.flatMap((c) =>
        c.txns.filter((tx) => tx.type === 'bill').map((tx) => txnToBillData(tx, formatCustomerName(c, uiLang))),
      );
      if (bills.length === 0) throw new Error('No customer patti on this date');
      const blob = generateBillsPdf(bills, shop, 'patti');
      await sharePdfViaWhatsApp(blob, `customer-patti-${date}.pdf`, `${shop.shopName || 'RVC'} — Customer Patti (${date})`);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Share failed');
    }
  };

  const printAllPattis = () => {
    for (const p of savedPattis) {
      printFarmerPatti(p, shop);
    }
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
      const savedSales: SavedSale[] = [];
      const purchaseIds: string[] = [];
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
              display: `${sale.bags || 0} bags${sale.weightKg ? `, ${sale.weightKg} kg` : ''}${
                sale.bagWeights.some((w) => num(w) > 0)
                  ? ` [${sale.bagWeights.filter((w) => w.trim()).join('+')} kg]`
                  : ''
              } @ ₹${sale.pricePerKg}/${rateUnit === 'per_10kg' ? '10kg' : 'kg'}`,
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
              ? { date, supplier: block.farmerName.trim(), supplierPhone: block.farmerPhone.trim() || null, total: tot.gross, items: purchaseItems }
              : null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Save failed for ${block.farmerName}`);
        savedPattis.push(toPatti(block));
        const ids = (data.sales || []) as { txnId: string; customerId: string }[];
        tot.validLines.forEach((sale, i) => {
          savedSales.push({
            txnId: ids[i]?.txnId || '',
            customerId: ids[i]?.customerId || sale.customerId || '',
            farmer: block.farmerName.trim(),
            commodity: sale.commodity.trim(),
            customerName: sale.customerName.trim(),
            bags: sale.bags,
            bagWeights: sale.bagWeights,
            weightKg: sale.weightKg,
            rate: sale.pricePerKg,
            amount: num(sale.amount),
            cash: sale.cash,
            hamali: sale.hamali,
          });
        });
        if (data.purchaseId) purchaseIds.push(data.purchaseId);
      }
      // Append to the live transactions list at the bottom
      setSavedSales((prev) => [...prev, ...savedSales]);
      // Deduplicate pattis by farmer name — keep the latest patti per farmer
      setSavedPattis((prev) => {
        const byFarmer = new Map(prev.map((p) => [p.farmer, p]));
        for (const p of savedPattis) byFarmer.set(p.farmer, p);
        return [...byFarmer.values()];
      });
      // Clear customer sale lines but keep farmer tabs and items intact
      setBlocks((prev) =>
        prev.map((b) => ({
          ...b,
          lots: b.lots.map((lot) => ({ ...lot, lines: [emptyLine(lot.commodity)] })),
          bardan: '', freight: '', advance: '', packing: '', other: '',
        })),
      );
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed — nothing was written');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setBlocks([emptyFarmer(commissionPct)]);
    setSavedSales([]);
    setSavedPattis([]);
    setSaveError('');
  };

  const deleteSavedSale = async (txnId: string) => {
    if (!txnId) return;
    if (!confirm(t('confirmDelete'))) return;
    const res = await fetch(`/api/transactions/${txnId}`, { method: 'DELETE' });
    if (!res.ok) {
      setSaveError('Could not delete this sale');
      return;
    }
    setSavedSales((prev) => prev.filter((s) => s.txnId !== txnId));
  };

  const editSavedPatti = async () => {
    // Delete all saved sales from this session and clear the list
    for (const s of savedSales) {
      if (s.txnId) await fetch(`/api/transactions/${s.txnId}`, { method: 'DELETE' }).catch(() => {});
    }
    setSavedSales([]);
    setSavedPattis([]);
    setSaveError('');
  };

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
        <PrintShareMenu
          options={[
            {
              key: 'patti',
              label: `${t('printFarmerPatti')} (${date})`,
              onPrint: printAllPattis,
            },
            {
              key: 'bills',
              label: `${t('printCustomerBills')} (${date})`,
              onPrint: printBills,
              onShare: shareBills,
            },
            {
              key: 'dues',
              label: `${t('printDues')} (${date})`,
              onPrint: printDues,
              onShare: shareDues,
            },
            {
              key: 'ledger',
              label: `${t('printLedger')} (${date})`,
              onPrint: printLedger,
              onShare: shareLedger,
            },
          ]}
        />
      </div>

      {/* Farmer tabs — browser-style */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-light)] pb-0">
        {blocks.map((block, fi) => {
          const isActive = block.id === activeTabId;
          const label = block.farmerName.trim() || `${t('farmer')} ${fi + 1}`;
          return (
            <div
              key={block.id}
              className={`flex shrink-0 items-center gap-1 rounded-t-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--bg-card)] font-semibold text-[var(--text-primary)]'
                  : 'bg-[var(--bg-base)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTabId(block.id)}
                className="max-w-[8rem] truncate text-left"
                title={label}
              >
                {label}
              </button>
              {blocks.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const remaining = blocks.filter((b) => b.id !== block.id);
                    setBlocks(remaining);
                    if (isActive && remaining.length > 0) {
                      setActiveTabId(remaining[0].id);
                    }
                  }}
                  className="text-xs text-[var(--text-faint)] hover:text-[var(--bg-danger)]"
                  title={t('removeFarmer')}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const newBlock = emptyFarmer(commissionPct);
            setBlocks((prev) => [...prev, newBlock]);
            setActiveTabId(newBlock.id);
          }}
          className="shrink-0 rounded-t-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]"
          title={t('addFarmer')}
        >
          +
        </button>
      </div>

      {blocks.filter((b) => b.id === activeTabId).map((block) => {
        const fi = blocks.findIndex((b) => b.id === block.id);
        const tot = totalsOf(block);
        return (
          <section key={block.id} className="space-y-1.5 rounded-xl rounded-t-none border border-t-0 border-[var(--border-card)] bg-[var(--bg-card)] p-2 sm:p-3">
            {/* Farmer + phone + hundekari — compact single row */}
            <div className="flex flex-wrap items-end gap-1.5">
              <div className="min-w-[8rem] flex-1">
                <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('farmer')} *</label>
                <Autocomplete
                  options={farmerNames}
                  value={block.farmerName}
                  onChange={(v) => patchBlock(block.id, (b) => ({ ...b, farmerName: v }))}
                  onSubmit={(v) => {
                    const name = v.trim();
                    if (!name) return;
                    const phone = farmerPhones[name] || '';
                    patchBlock(block.id, (b) => ({ ...b, farmerName: name, farmerPhone: phone }));
                  }}
                  placeholder="LOCAL, RSB…"
                  className="text-xs"
                />
              </div>
              <div className="w-32">
                <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('phone')}</label>
                <input
                  value={block.farmerPhone}
                  onChange={(e) => patchBlock(block.id, (b) => ({ ...b, farmerPhone: e.target.value }))}
                  className={smInput}
                  inputMode="tel"
                />
              </div>
              <div className="w-32">
                <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('hundekari')}</label>
                <input
                  value={block.hundekari}
                  onChange={(e) => patchBlock(block.id, (b) => ({ ...b, hundekari: e.target.value }))}
                  className={smInput}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAddFarmer((v) => (v === block.id ? null : block.id))}
                className="min-h-9 rounded text-[10px] text-[var(--text-muted)] underline"
              >
                + {t('farmer')}
              </button>
            </div>
            {showAddFarmer === block.id && (
              <div className="flex flex-wrap gap-1.5">
                <input value={newFarmerName} onChange={(e) => setNewFarmerName(e.target.value)} placeholder={t('farmer')} className={`${smInput} max-w-xs`} />
                <input value={newFarmerPhone} onChange={(e) => setNewFarmerPhone(e.target.value)} placeholder={t('phone')} className={`${smInput} max-w-[10rem]`} />
                <button type="button" onClick={() => handleAddFarmerName(block.id)} disabled={addingFarmer} className="min-h-9 rounded bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-on-primary)]">
                  {t('savePhone')}
                </button>
              </div>
            )}

            {/* ── Item chips (click to open stock popover) ──────────────────── */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {block.lots.map((lt, li) => {
                const isSel = (selectedLotId || block.lots[0]?.id) === lt.id;
                const tally = tot.tally.find((r) => itemKey(r.item) === itemKey(lt.commodity));
                const stockLabel = lt.commodity.trim()
                  ? `${lt.commodity}${num(lt.bags) > 0 ? ` ${lt.bags}/${num(lt.kg) > 0 ? `${lt.kg}kg` : ''}` : ''}`
                  : `${t('item')} ${li + 1}`;
                const oversold = tally?.oversold;
                return (
                  <div
                    key={lt.id}
                    className={`group relative flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      isSel
                        ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                        : 'bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-input)]'
                    }`}
                  >
                    <button
                      type="button"
                      className="truncate"
                      onClick={() => {
                        setSelectedLotId(lt.id);
                        setStockPopoverId(lt.id);
                      }}
                      onDoubleClick={() => setEditingLotId(lt.id)}
                      title={oversold ? '⚠ oversold' : 'Click to edit stock'}
                    >
                      {stockLabel}
                      {oversold && <span className="ml-0.5">⚠</span>}
                    </button>
                    {block.lots.length > 1 && (
                      <button
                        type="button"
                        className="text-[10px] opacity-60 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          patchBlock(block.id, (b) => ({ ...b, lots: b.lots.filter((l) => l.id !== lt.id) }));
                          setSelectedLotId(null);
                          setStockPopoverId(null);
                        }}
                        aria-label={`Delete ${lt.commodity.trim() || `item ${li + 1}`}`}
                      >
                        ✕
                      </button>
                    )}
                    {/* Stock popover */}
                    {stockPopoverId === lt.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setStockPopoverId(null)} />
                        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-2 text-[var(--text-primary)] shadow-lg">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-xs font-semibold">{lt.commodity.trim() || `${t('item')} ${li + 1}`}</span>
                            <button
                              type="button"
                              className="text-[10px] text-[var(--text-muted)]"
                              onClick={() => setStockPopoverId(null)}
                            >
                              ✕
                            </button>
                          </div>
                          <div className="flex flex-wrap items-end gap-1.5 text-xs">
                            <label className="flex items-center gap-1">
                              <span className="text-[var(--text-muted)]">{t('bags')}</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={lt.bags}
                                placeholder="200"
                                className={`${smInput} w-14`}
                                onChange={(e) => {
                                  const s = fillStock(e.target.value, lt.kg, lt.avg, 'bags');
                                  patchLot(block.id, lt.id, (l) => ({ ...l, ...s, commodity: l.commodity, lines: l.lines }));
                                }}
                              />
                            </label>
                            <label className="flex items-center gap-1">
                              <span className="text-[var(--text-muted)]">kg</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={lt.kg}
                                placeholder="3000"
                                className={`${smInput} w-16`}
                                onChange={(e) => {
                                  const s = fillStock(lt.bags, e.target.value, lt.avg, 'kg');
                                  patchLot(block.id, lt.id, (l) => ({ ...l, ...s, commodity: l.commodity, lines: l.lines }));
                                }}
                              />
                            </label>
                            <label className="flex items-center gap-1">
                              <span className="text-[var(--text-muted)]">avg</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={lt.avg}
                                placeholder="15"
                                className={`${smInput} w-12`}
                                onChange={(e) => {
                                  const s = fillStock(lt.bags, lt.kg, e.target.value, 'avg');
                                  patchLot(block.id, lt.id, (l) => ({ ...l, ...s, commodity: l.commodity, lines: l.lines }));
                                }}
                              />
                            </label>
                          </div>
                          {tally && lt.commodity.trim() && (
                            <p className={`mt-1.5 text-[10px] ${tally.oversold ? 'text-[var(--bg-danger)]' : 'text-[var(--text-muted)]'}`}>
                              {t('stockReceived')} {tally.inBags} / {tally.inKg}kg · sold {tally.soldBags} / {tally.soldKg}kg · {t('leftover')} {tally.leftBags} / {tally.leftKg}kg
                              {tally.oversold ? ' ⚠' : ''}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {/* Add new item input with autocomplete from catalog */}
              <Autocomplete
                options={catalog}
                value={newItemName}
                onChange={(v) => setNewItemName(v)}
                onSubmit={(v) => {
                  const name = v.trim();
                  if (!name) return;
                  // Check if item already exists for this farmer
                  const existing = block.lots.find((l) => itemKey(l.commodity) === itemKey(name));
                  if (existing) {
                    setSelectedLotId(existing.id);
                    setStockPopoverId(existing.id);
                  } else {
                    const newLot = emptyLot(name);
                    rememberItem(name);
                    patchBlock(block.id, (b) => ({ ...b, lots: [...b.lots, newLot] }));
                    setSelectedLotId(newLot.id);
                  }
                  setNewItemName('');
                }}
                placeholder="+ item name…"
                className="w-32 text-xs"
              />
            </div>

            {/* Inline edit for chip name */}
            {(() => {
              const lot = block.lots.find((l) => l.id === selectedLotId) || block.lots[0];
              if (!lot) return null;
              if (editingLotId === lot.id) {
                return (
                  <input
                    type="text"
                    value={lot.commodity}
                    autoFocus
                    onChange={(e) => {
                      const v = e.target.value;
                      patchLot(block.id, lot.id, (l) => ({
                        ...l,
                        commodity: v,
                        lines: l.lines.map((ln) => ({ ...ln, commodity: v })),
                      }));
                    }}
                    onBlur={() => {
                      if (lot.commodity.trim()) rememberItem(lot.commodity.trim());
                      setEditingLotId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (lot.commodity.trim()) rememberItem(lot.commodity.trim());
                        setEditingLotId(null);
                      }
                      if (e.key === 'Escape') setEditingLotId(null);
                    }}
                    className={smInput}
                  />
                );
              }
              return null;
            })()}

            {block.lots.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">Type an item name above and press Enter to add it.</p>
            )}

            {/* ── Sale entry (compact table row) ────────────────────────────── */}
            {(() => {
              const lot = block.lots.find((l) => l.id === selectedLotId) || block.lots[0];
              if (!lot) return null;
              const line = lot.lines[0];
              if (!line) return null;
              return (
                <div className="space-y-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-base)] p-1.5">
                  <div className="flex flex-wrap items-end gap-1.5 text-xs">
                    {/* Customer */}
                    <div className="min-w-[7rem] flex-1">
                      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('customer')}</label>
                      <Autocomplete
                        options={customerNames}
                        value={line.customerName}
                        onChange={(v) => {
                          const match = customers.find(
                            (c) =>
                              c.name.toLowerCase() === v.trim().toLowerCase() ||
                              formatCustomerName(c, uiLang).toLowerCase() === v.trim().toLowerCase(),
                          );
                          const isCash = v.trim().toUpperCase() === 'CASH SALES' || v.trim().toUpperCase() === 'CASH SALE ACOUNT';
                          patchLotLine(block.id, lot.id, line.id, (ln) => ({
                            ...ln,
                            customerName: v,
                            customerId: match?.id || (isCash ? cashCustomer?.id || null : null),
                            cash: isCash,
                            commodity: lot.commodity,
                          }));
                        }}
                        placeholder="Name or CASH"
                        className="text-xs"
                      />
                    </div>
                    {/* Item dropdown — only this farmer's items */}
                    <div className="w-20">
                      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('item')}</label>
                      <select
                        value={lot.id}
                        onChange={(e) => setSelectedLotId(e.target.value)}
                        className={`${smInput} w-full`}
                      >
                        {block.lots.map((l, i) => (
                          <option key={l.id} value={l.id}>
                            {l.commodity.trim() || `${t('item')} ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Bags */}
                    <div className="w-14">
                      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('bags')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_SALE_BAGS}
                        value={line.bags}
                        placeholder="20"
                        className={`${smInput} w-full`}
                        onChange={(e) =>
                          patchLotLine(block.id, lot.id, line.id, (ln) =>
                            fillLine(ln, { bags: e.target.value, commodity: lot.commodity }, rateUnit, 'bags'),
                          )
                        }
                      />
                    </div>
                    {/* Rate */}
                    <div className="w-16">
                      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">
                        {rateUnit === 'per_10kg' ? '₹/10kg' : '₹/kg'}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={line.pricePerKg}
                        placeholder={rateUnit === 'per_10kg' ? '220' : '22'}
                        className={`${smInput} w-full`}
                        onChange={(e) =>
                          patchLotLine(block.id, lot.id, line.id, (ln) =>
                            fillLine(ln, { pricePerKg: e.target.value, commodity: lot.commodity }, rateUnit, 'rate'),
                          )
                        }
                      />
                    </div>
                    {/* Amount */}
                    <div className="w-20">
                      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('amt')}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={line.amount}
                        className={`${smInput} w-full font-semibold`}
                        onChange={(e) =>
                          patchLotLine(block.id, lot.id, line.id, (ln) =>
                            fillLine(ln, { amount: e.target.value, commodity: lot.commodity }, rateUnit, 'amount'),
                          )
                        }
                      />
                    </div>
                    {/* Hamali */}
                    <div className="w-14">
                      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{t('hamali')}</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={line.hamali}
                        className={`${smInput} w-full`}
                        onChange={(e) => patchLotLine(block.id, lot.id, line.id, (ln) => ({ ...ln, hamali: e.target.value }))}
                      />
                    </div>
                    {/* Cash/Credit toggle */}
                    <div className="w-16">
                      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">&nbsp;</label>
                      <button
                        type="button"
                        onClick={() => {
                          patchLotLine(block.id, lot.id, line.id, (ln) =>
                            ln.cash
                              ? { ...ln, cash: false }
                              : { ...ln, cash: true, commodity: lot.commodity },
                          );
                        }}
                        className={`min-h-9 w-full rounded border px-1 py-1 text-[10px] font-medium ${
                          line.cash
                            ? 'bg-[var(--bg-success)] text-[var(--text-on-success)] border-[var(--bg-success)]'
                            : 'border border-[var(--border-input)] text-[var(--text-muted)]'
                        }`}
                      >
                        {line.cash ? t('cashSale') : t('creditSale')}
                      </button>
                    </div>
                  </div>
                  {/* Weight entry — per-bag or total toggle */}
                  {line.bagWeights.length > 0 && (() => {
                    const expanded = weightsExpanded[line.id] !== false; // default expanded
                    const hasWeights = line.bagWeights.some((w) => w.trim() !== '');
                    return (
                    <div className="flex flex-wrap items-center gap-1">
                      {/* Toggle: per-bag vs total */}
                      <div className="flex shrink-0 rounded border border-[var(--border-input)] text-[9px]">
                        <button
                          type="button"
                          className={`px-1.5 py-0.5 ${line.weightMode !== 'total' ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]' : 'text-[var(--text-muted)]'}`}
                          onClick={() => patchLotLine(block.id, lot.id, line.id, (ln) => ({ ...ln, weightMode: 'per_bag' }))}
                        >
                          per bag
                        </button>
                        <button
                          type="button"
                          className={`px-1.5 py-0.5 ${line.weightMode === 'total' ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]' : 'text-[var(--text-muted)]'}`}
                          onClick={() => patchLotLine(block.id, lot.id, line.id, (ln) => ({ ...ln, weightMode: 'total' }))}
                        >
                          total
                        </button>
                      </div>
                      {line.weightMode === 'total' ? (
                        /* Single total weight input */
                        <input
                          type="number"
                          inputMode="decimal"
                          value={line.weightKg}
                          placeholder="total kg"
                          aria-label="Total weight kg"
                          className={`${smInput} w-20`}
                          onChange={(e) =>
                            patchLotLine(block.id, lot.id, line.id, (ln) =>
                              fillLine(ln, { commodity: lot.commodity, weightKg: e.target.value }, rateUnit, 'totalWeight'),
                            )
                          }
                        />
                      ) : hasWeights && !expanded ? (
                        /* Collapsed summary — show total + edit button */
                        <button
                          type="button"
                          className="text-[10px] text-[var(--text-muted)] underline"
                          onClick={() => setWeightsExpanded((s) => ({ ...s, [line.id]: true }))}
                        >
                          {line.bagWeights.filter((w) => w.trim()).length} bags · {line.weightKg}kg ✎
                        </button>
                      ) : (
                        /* Per-bag weight inputs — tiny grid */
                        <div className="flex flex-wrap gap-0.5">
                          {line.bagWeights.map((w, wi) => (
                            <input
                              key={`${line.id}-w-${wi}`}
                              type="number"
                              inputMode="decimal"
                              value={w}
                              placeholder={`${wi + 1}`}
                              aria-label={`${t('bag')} ${wi + 1} kg`}
                              className="h-7 w-8 rounded border border-[var(--border-input)] bg-[var(--bg-base)] px-0.5 text-center text-[9px] text-[var(--text-primary)] tabular-nums"
                              onChange={(e) =>
                                patchLotLine(block.id, lot.id, line.id, (ln) =>
                                  fillLine(
                                    ln,
                                    {
                                      commodity: lot.commodity,
                                      bagWeights: ln.bagWeights.map((x, j) => (j === wi ? e.target.value : x)),
                                    },
                                    rateUnit,
                                    'weight',
                                  ),
                                )
                              }
                            />
                          ))}
                          {hasWeights && (
                            <button
                              type="button"
                              className="ml-1 text-[9px] text-[var(--text-muted)] underline"
                              onClick={() => setWeightsExpanded((s) => ({ ...s, [line.id]: false }))}
                            >
                              done
                            </button>
                          )}
                        </div>
                      )}
                      {num(line.weightKg) > 0 && (line.weightMode === 'total' || (hasWeights && !expanded)) && (
                        <span className="text-[10px] text-[var(--text-muted)]">= {line.weightKg}kg</span>
                      )}
                    </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Charges — compact single row */}
            <div className="flex flex-wrap items-end gap-1.5 rounded-lg bg-[var(--bg-base)] p-1.5 text-xs">
              <ChargeBox label={`${t('commission')}%`} value={block.commissionPct} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, commissionPct: v }))} suffix={`₹${fmt(tot.comm)}`} />
              <ChargeBox label={t('hamali')} value={block.hamaliTotal} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, hamaliTotal: v }))} placeholder={tot.validLines.length ? String(tot.validLines.reduce((s, l) => s + num(l.hamali), 0) || '') : '0'} />
              <ChargeBox label={t('chargesBardan')} value={block.bardan} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, bardan: v }))} />
              <ChargeBox label={t('chargesFreight')} value={block.freight} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, freight: v }))} />
              <ChargeBox label={t('chargesAdvance')} value={block.advance} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, advance: v }))} />
              <ChargeBox label={t('chargesPacking')} value={block.packing} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, packing: v }))} />
              <ChargeBox label={t('chargesOther')} value={block.other} onChange={(v) => patchBlock(block.id, (b) => ({ ...b, other: v }))} />
              <div className="ml-auto flex items-center gap-3 self-center">
                <span className="text-[var(--text-muted)]">{t('grossSale')} <b className="text-[var(--text-primary)]">{fmt(tot.gross)}</b></span>
                <span className="text-[var(--text-muted)]">Exp <b className="text-[var(--text-primary)]">{fmt(tot.exp)}</b></span>
                <span className="text-[var(--text-muted)]">{t('nettSale')} <b className="text-[var(--bg-success)]">{fmt(tot.nett)}</b></span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => printFarmerPatti(toPatti(block), shop)}
              disabled={tot.validLines.length === 0}
              className="min-h-9 w-full rounded-md border border-[var(--border-input)] text-xs disabled:opacity-40"
            >
              {t('printPatti')} — {block.farmerName || `${t('farmer')} ${fi + 1}`}
            </button>
          </section>
        );
      })}

      {saveError && (
        <p className="rounded-lg bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--text-on-primary)]" role="alert">
          {saveError}
        </p>
      )}

      {/* Live transactions — saved sales appear here on the same page */}
      {savedSales.length > 0 && (
        <section className="rounded-2xl bg-[var(--bg-card)] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-muted)]">
              {t('salesToday')} — {savedSales.length} {t('lines')}
            </h2>
            <div className="flex gap-1">
              {savedPattis.map((p) => (
                <button
                  key={p.farmer}
                  type="button"
                  onClick={() => printFarmerPatti(p, shop)}
                  className="rounded-lg bg-[var(--bg-secondary)] px-2 py-1 text-xs font-medium text-[var(--text-on-primary)]"
                >
                  <PrinterIcon size={12} className="inline" /> {p.farmer}
                </button>
              ))}
              <button
                type="button"
                onClick={editSavedPatti}
                className="rounded-lg border border-[var(--border-input)] px-2 py-1 text-xs text-[var(--text-muted)]"
              >
                {t('editPatti')}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-[var(--border-input)] px-2 py-1 text-xs text-[var(--text-muted)]"
              >
                {t('newEntry')}
              </button>
            </div>
          </div>
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
                  <th className="py-1.5 pr-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {savedSales.map((s, i) => (
                  <tr
                    key={s.txnId || `${s.customerName}-${i}`}
                    className={`border-l-4 ${s.cash ? 'border-l-[var(--bg-success)]' : 'border-l-[var(--bg-primary)]'} border-b border-[var(--border-light)]`}
                  >
                    <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)]">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium">{s.commodity}</td>
                    <td className="py-1.5 pr-2">
                      {s.customerName}
                      <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-medium ${s.cash ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'}`}>
                        {s.cash ? t('cashSale') : t('creditSale')}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">{s.bags || '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{s.weightKg || '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{s.rate}</td>
                    <td className="py-1.5 pr-2 text-right">{num(s.hamali) > 0 ? s.hamali : '—'}</td>
                    <td className="py-1.5 pr-2 text-right font-medium">{fmt(s.amount)}</td>
                    <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)]">{s.farmer}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center justify-center gap-1">
                        {s.customerId && (
                          <Link
                            href={`/customers/${s.customerId}`}
                            className="rounded px-2 py-0.5 text-xs text-[var(--bg-primary)] hover:bg-[var(--bg-base)]"
                            title={t('edit')}
                          >
                            ✎
                          </Link>
                        )}
                        {s.txnId && (
                          <button
                            type="button"
                            onClick={() => deleteSavedSale(s.txnId)}
                            className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                            title={t('delete')}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer totals */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border-light)] pt-3 sm:gap-3">
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('totalBags')}</p>
              <p className="text-lg font-bold">{savedSales.reduce((s, l) => s + num(l.bags), 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('totalKgs')}</p>
              <p className="text-lg font-bold">{(() => { const k = savedSales.reduce((s, l) => s + num(l.weightKg), 0); return k > 0 ? k.toFixed(1) : '—'; })()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('totalAmount')}</p>
              <p className="text-lg font-bold text-[var(--bg-primary)]">{fmt(savedSales.reduce((s, l) => s + l.amount, 0))}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-lg border-l-4 border-l-[var(--bg-success)] bg-[var(--bg-base)] p-2 text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('cash')}</p>
              <p className="text-sm font-bold">{fmt(savedSales.filter((s) => s.cash).reduce((s, l) => s + l.amount, 0))}</p>
            </div>
            <div className="rounded-lg border-l-4 border-l-[var(--bg-primary)] bg-[var(--bg-base)] p-2 text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('credit')}</p>
              <p className="text-sm font-bold">{fmt(savedSales.filter((s) => !s.cash).reduce((s, l) => s + l.amount, 0))}</p>
            </div>
          </div>
        </section>
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
    <div className="w-16">
      <label className="mb-0.5 block text-[10px] text-[var(--text-muted)]">{label}</label>
      <input type="number" inputMode="decimal" value={value} placeholder={placeholder || '0'} onChange={(e) => onChange(e.target.value)} className={`${smInput} w-full`} />
      {suffix && <p className="mt-0.5 text-[9px] text-[var(--text-faint)]">{suffix}</p>}
    </div>
  );
}
