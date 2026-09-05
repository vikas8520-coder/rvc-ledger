'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePersistentState } from '../components/usePersistentState';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { fmt, fmtTime } from '@/lib/format';
import Autocomplete from '../components/Autocomplete';
import { printFarmerPatti, type FarmerPattiData, type ShopProfile } from '@/lib/billPrint';
import { PrinterIcon } from '../components/Icons';
import PrintShareMenu from '../components/PrintShareMenu';
import { recognizeBill, type OcrProgress } from '@/lib/ocr';
import { recognizeWithPaddle, type PaddleProgress, type OcrLine as PaddleOcrLine, extractPdfTextDirect } from '@/lib/paddleOcr';
import { parseBillSmart, parseMultiBillPdf, parseCreditLedgerPdf, type SmartBillItem, type ParsedBill, type ParsedLedgerEntry } from '@/lib/billParser';
import { setRuntimeAliases } from '@/lib/catalog';
import { calculateHamali, type HamaliRate } from '@/lib/db';
import {
  generateOutstandingListPdf,
  generateCreditLedgerPdf,
  generateBillsPdf,
  printPdfBlob,
  sharePdfViaWhatsApp,
} from '@/lib/pdfShare';
import { txnToBillData, type CreditLedgerEntry, type BillPrintData } from '@/lib/billPrint';
import { sliceCustomer, rangeLabel } from '@/lib/dateRange';
import type { Customer } from '@/lib/types';

function today() {
  // Use IST explicitly — the user's device timezone might not be set to Asia/Kolkata
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
  phone?: string | null;
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
  createdAt?: string | null;
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
  const { t, lang, ocrLangs } = useI18n();
  const uiLang = getUiLang(lang);
  const [date, setDate] = usePersistentState('entry-date', today(), (loaded) => {
    // Day rollover: if the persisted date is before today, reset to today.
    // This ensures the entry page starts fresh each new day — previous
    // day's sales remain in the DB and visible in Overview/Customers/Farmers.
    const realToday = today();
    return loaded < realToday ? realToday : loaded;
  });
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
  const [farmerCommissions, setFarmerCommissions] = useState<Record<string, string>>({});
  const [farmerIds, setFarmerIds] = useState<Record<string, string>>({});
  const [hamaliRates, setHamaliRates] = useState<HamaliRate[]>([]);
  const [shop, setShop] = useState<ShopProfile>({});
  const [showAddFarmer, setShowAddFarmer] = useState<string | null>(null);
  const [newFarmerName, setNewFarmerName] = useState('');
  const [newFarmerPhone, setNewFarmerPhone] = useState('');
  const [addingFarmer, setAddingFarmer] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [ocrSuccess, setOcrSuccess] = useState<string | null>(null);
  const [showShareFor, setShowShareFor] = useState<string | null>(null);
  const [showCommissionEditor, setShowCommissionEditor] = useState(false);
  const [commissionEditName, setCommissionEditName] = useState('');
  const [commissionEditValue, setCommissionEditValue] = useState('');
  const [showHamaliBreakdown, setShowHamaliBreakdown] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<'owner' | 'data_entry'>('owner');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);
  // Self-learning: track OCR-imported lines so we can auto-save corrections
  const ocrImportRef = useRef<{
    commodityRawToConfirmed: Map<string, string>; // raw → confirmed name
    customerRawToConfirmed: Map<string, { name: string; id: string | null }>;
  }>({ commodityRawToConfirmed: new Map(), customerRawToConfirmed: new Map() });

  // Day rollover for when the app is left open overnight: check when the
  // page regains focus and reset the date + form if a new day has started.
  useEffect(() => {
    const onFocus = () => {
      const t = today();
      setDate((prev) => {
        if (prev < t) {
          setBlocks([emptyFarmer(commissionPct)]);
          setSavedSales([]);
          setSavedPattis([]);
          return t;
        }
        return prev;
      });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Fetch user profile (admin vs data_entry)
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => { if (d.profile) setUserProfile(d.profile); })
      .catch(() => {});
  }, []);

  // Close per-transaction share dropdown when clicking outside
  useEffect(() => {
    if (!showShareFor) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-share-dropdown]')) {
        setShowShareFor(null);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showShareFor]);

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
        const commMap: Record<string, string> = {};
        const idMap: Record<string, string> = {};
        for (const s of sups) {
          if (s.phone) phoneMap[s.name] = s.phone;
          if (s.commissionPct) commMap[s.name] = s.commissionPct;
          if (s.id) idMap[s.name] = s.id;
        }
        setFarmerPhones(phoneMap);
        setFarmerCommissions(commMap);
        setFarmerIds(idMap);
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
    // Self-learning: load commodity aliases so the smart parser can use them
    fetch('/api/catalog/aliases')
      .then((r) => r.json())
      .then((d) => {
        if (d.aliases) setRuntimeAliases(d.aliases);
      })
      .catch(() => {});
    // Load hamali rates for auto-calculation
    fetch('/api/hamali')
      .then((r) => r.json())
      .then((d) => {
        if (d.rates) setHamaliRates(d.rates);
      })
      .catch(() => {});
  }, []);

  // Re-fetch saved sales from DB whenever the date changes — so the
  // "Sales today" section survives page refreshes and date switches.
  // Use a ref to skip the initial fetch on mount (the usePersistentState
  // hydration race can cause blocks to be overwritten otherwise).
  const dateRef = useRef<string | null>(null);
  useEffect(() => {
    // On first run, just record the date and do a delayed fetch
    if (dateRef.current === null) {
      dateRef.current = date;
      // Delay the initial fetch to let usePersistentState hydrate blocks first
      const timer = setTimeout(() => {
        fetchSavedSales(date);
      }, 500);
      return () => clearTimeout(timer);
    }
    if (dateRef.current === date) return;
    dateRef.current = date;
    fetchSavedSales(date);
  }, [date]);

  const fetchSavedSales = (d: string) => {
    fetch(`/api/transactions?date=${encodeURIComponent(d)}`)
      .then((r) => r.json())
      .then((data) => {
        const sales = data.sales || [];
        setSavedSales(sales);
        const byFarmer = new Map<string, FarmerPattiData>();
        for (const s of sales) {
          if (!byFarmer.has(s.farmer)) {
            byFarmer.set(s.farmer, {
              farmer: s.farmer,
              date: d,
              lines: [],
              comm: 0, hamali: 0, bardan: 0, freight: 0, advance: 0, packing: 0, other: 0,
            });
          }
          byFarmer.get(s.farmer)!.lines.push({
            customer: s.customerName,
            commodity: s.commodity,
            qty: s.bags,
            weight: s.weightKg,
            rate: s.rate,
            amount: s.amount,
            cash: s.cash,
          });
        }
        setSavedPattis([...byFarmer.values()]);
      })
      .catch(() => {});
  };

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
      const trimmedName = newFarmerName.trim();
      setFarmerNames((prev) => [...prev, trimmedName].sort());
      if (newFarmerPhone.trim()) {
        setFarmerPhones((prev) => ({ ...prev, [trimmedName]: newFarmerPhone.trim() }));
      }
      if (d.supplier?.id) {
        setFarmerIds((prev) => ({ ...prev, [trimmedName]: d.supplier.id }));
      }
      patchBlock(blockId, (b) => ({ ...b, farmerName: trimmedName, farmerPhone: newFarmerPhone.trim() }));
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
    // Auto-calculate hamali from Bowenpally market rates if no manual hamali is entered.
    // Hamali is charged per bag/box received from the farmer.
    // Use LOT stock bags/kg if entered; otherwise fall back to sale line bags/weight.
    let hamali = num(block.hamaliTotal) || lineHamali;
    let hamaliBreakdown: { commodity: string; bags: number; weightKg: number | null; perBag: number; total: number; label: string }[] = [];
    if (!hamali && hamaliRates.length > 0 && validLines.length > 0) {
      // Group sale lines by commodity to sum up bags and weight
      const saleByCommodity = new Map<string, { bags: number; weightKg: number; commodity: string }>();
      for (const l of validLines) {
        const key = itemKey(l.commodity);
        const cur = saleByCommodity.get(key) || { bags: 0, weightKg: 0, commodity: l.commodity };
        cur.bags += num(l.bags);
        cur.weightKg += num(l.weightKg);
        saleByCommodity.set(key, cur);
      }
      // For each lot, calculate hamali using lot stock data or fall back to sale line data
      // Only the SELLER share is deducted from the farmer's gross.
      // The PURCHASER share is paid by the buyer — not RVC's expense.
      let autoHamali = 0;
      const coveredCommodities = new Set<string>();
      for (const lot of block.lots) {
        if (!lot.commodity.trim()) continue;
        const key = itemKey(lot.commodity);
        coveredCommodities.add(key);
        const lotBags = num(lot.bags);
        const lotKg = num(lot.kg);
        const saleData = saleByCommodity.get(key);
        // Prefer lot stock; fall back to sale line data
        const bags = lotBags > 0 ? lotBags : (saleData?.bags || 0);
        const weight = lotKg > 0 ? lotKg : (saleData?.weightKg || null);
        if (bags <= 0 && (weight == null || weight <= 0)) continue;
        const calc = calculateHamali(lot.commodity, weight, hamaliRates, bags > 0 ? bags : 1);
        autoHamali += calc.seller;
        hamaliBreakdown.push({ commodity: lot.commodity, bags, weightKg: weight, perBag: calc.seller / (bags > 0 ? bags : 1), total: calc.seller, label: calc.label });
      }
      // Handle commodities that only exist on sale lines (no lot stock row with data)
      for (const [key, data] of saleByCommodity) {
        if (coveredCommodities.has(key)) continue;
        if (data.bags <= 0 && data.weightKg <= 0) continue;
        const calc = calculateHamali(data.commodity, data.weightKg > 0 ? data.weightKg : null, hamaliRates, data.bags > 0 ? data.bags : 1);
        autoHamali += calc.seller;
        hamaliBreakdown.push({ commodity: data.commodity, bags: data.bags, weightKg: data.weightKg > 0 ? data.weightKg : null, perBag: calc.seller / (data.bags > 0 ? data.bags : 1), total: calc.seller, label: calc.label });
      }
      hamali = autoHamali;
    }
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
    return { validLines, gross, comm, hamali, hamaliBreakdown, exp, nett: gross - exp, tally };
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
      // Use savedSales directly — this is the most reliable source
      // of today's data on the entry page
      if (savedSales.length > 0) {
        const bills = savedSales.map(saleToBillData);
        printPdfBlob(generateBillsPdf(bills, shop, 'patti'));
        return;
      }
      // Fallback: fetch from dashboard API
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      const bills = sliced.flatMap((c) =>
        c.txns.filter((tx) => tx.type === 'bill').map((tx) => txnToBillData(tx, formatCustomerName(c, uiLang))),
      );
      if (bills.length === 0) throw new Error('No customer bill on this date');
      printPdfBlob(generateBillsPdf(bills, shop, 'patti'));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Print failed');
    }
  };

  const shareBills = async () => {
    try {
      if (savedSales.length > 0) {
        const bills = savedSales.map(saleToBillData);
        const blob = generateBillsPdf(bills, shop, 'patti');
        await sharePdfViaWhatsApp(blob, `customer-patti-${date}.pdf`, `${shop.shopName || 'RVC'} — Customer Patti (${date})`);
        return;
      }
      const fullCustomers = await fetchDashboardCustomers();
      const sliced = fullCustomers.map((c) => sliceCustomer(c, date, date));
      const bills = sliced.flatMap((c) =>
        c.txns.filter((tx) => tx.type === 'bill').map((tx) => txnToBillData(tx, formatCustomerName(c, uiLang))),
      );
      if (bills.length === 0) throw new Error('No customer bill on this date');
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

  // ── Per-sale print/share ──────────────────────────────────────────
  // Convert a SavedSale to BillPrintData for individual printing
  const saleToBillData = (s: SavedSale): BillPrintData => ({
    customerName: s.customerName,
    date,
    billNo: null,
    total: s.amount,
    items: [
      {
        name: s.commodity,
        qty: s.weightKg || s.bags || null,
        rate: s.rate || null,
        amount: s.amount,
        display: `${s.bags || 0} bags${s.weightKg ? `, ${s.weightKg} kg` : ''} @ ₹${s.rate}`,
        kind: 'item' as const,
        chargeCode: null,
        bags: s.bags || null,
      },
    ],
  });

  const printSale = (s: SavedSale) => {
    try {
      const bill = saleToBillData(s);
      printPdfBlob(generateBillsPdf([bill], shop, 'patti'));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Print failed');
    }
  };

  const shareSale = async (s: SavedSale) => {
    try {
      const bill = saleToBillData(s);
      const blob = generateBillsPdf([bill], shop, 'patti');
      const filename = `patti-${s.customerName.replace(/\s+/g, '-')}-${date}.pdf`;
      const text = `${shop.shopName || 'RVC Ledger'} — ${s.customerName} — ${s.commodity} — ₹${s.amount}`;
      await sharePdfViaWhatsApp(blob, filename, text);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Share failed');
    }
  };

  // Group sales by customer for per-customer print/share
  const salesByCustomer = useMemo(() => {
    const map = new Map<string, SavedSale[]>();
    for (const s of savedSales) {
      const key = s.customerName.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [savedSales]);

  const printCustomerSales = (customerName: string) => {
    const sales = salesByCustomer.get(customerName.trim().toLowerCase()) || [];
    if (sales.length === 0) return;
    const bills = sales.map(saleToBillData);
    try {
      printPdfBlob(generateBillsPdf(bills, shop, 'patti'));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Print failed');
    }
  };

  const shareCustomerSales = async (customerName: string) => {
    const sales = salesByCustomer.get(customerName.trim().toLowerCase()) || [];
    if (sales.length === 0) return;
    const bills = sales.map(saleToBillData);
    const total = sales.reduce((s, x) => s + x.amount, 0);
    try {
      const blob = generateBillsPdf(bills, shop, 'patti');
      const filename = `patti-${customerName.replace(/\s+/g, '-')}-${date}.pdf`;
      const text = `${shop.shopName || 'RVC Ledger'} — ${customerName} — ${date} — ₹${total}`;
      await sharePdfViaWhatsApp(blob, filename, text);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Share failed');
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
            createdAt: new Date().toISOString(),
          });
        });
        if (data.purchaseId) purchaseIds.push(data.purchaseId);
      }
      // ── Self-learning: auto-save corrections and rates ──
      // When the user uploads a bill and then edits the commodity/customer
      // names before saving, we learn from those corrections so future
      // OCR imports are more accurate. We also save the rates used.
      // This runs in the background — it must NOT block the UI or the
      // saved-sales refresh, since the test waits for the table to update.
      const learnedRef = ocrImportRef.current;
      (async () => {
        try {
          const learnedPromises: Promise<void>[] = [];
          for (const block of ready) {
            const tot = totalsOf(block);
            for (const sale of tot.validLines) {
              const commodityRaw = sale.commodity.trim();
              if (!commodityRaw) continue;
              // Check if the user changed the commodity name from what OCR imported
              const imported = learnedRef.commodityRawToConfirmed.get(commodityRaw.toLowerCase().trim());
              if (imported && imported !== commodityRaw) {
                learnedPromises.push(
                  fetch('/api/catalog/aliases', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ alias: commodityRaw, itemName: imported }),
                  }).then(() => {}),
                );
              }
              // Save the rate for this commodity (for rate suggestions later)
              const rateNum = num(sale.pricePerKg);
              if (rateNum > 0 && sale.commodity.trim()) {
                learnedPromises.push(
                  fetch('/api/rates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      commodity: sale.commodity.trim(),
                      rate: rateNum,
                      rateUnit,
                      date,
                    }),
                  }).then(() => {}),
                );
              }
              // Save customer name alias if we have one
              const customerRaw = sale.customerName.trim();
              if (customerRaw && sale.customerId) {
                learnedPromises.push(
                  fetch('/api/customers/aliases', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      rawName: customerRaw,
                      customerName: customerRaw,
                      customerId: sale.customerId,
                    }),
                  }).then(() => {}),
                );
              }
            }
          }
          await Promise.all(learnedPromises);
          // Refresh aliases in memory for next OCR import
          const aliasRes = await fetch('/api/catalog/aliases');
          const aliasData = await aliasRes.json();
          if (aliasData.aliases) setRuntimeAliases(aliasData.aliases);
        } catch (e) {
          console.warn('Self-learning save failed:', e);
        }
      })();
      // Clear the OCR import tracking immediately
      ocrImportRef.current = {
        commodityRawToConfirmed: new Map(),
        customerRawToConfirmed: new Map(),
      };

      // Re-fetch saved sales from DB so the list is always accurate
      // (includes sales from this session AND any saved by other devices)
      fetchSavedSales(date);
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
    fetchSavedSales(date);
  };

  const editSavedPatti = async () => {
    // Delete all saved sales for this date and clear the list
    for (const s of savedSales) {
      if (s.txnId) await fetch(`/api/transactions/${s.txnId}`, { method: 'DELETE' }).catch(() => {});
    }
    setSavedSales([]);
    setSavedPattis([]);
    setSaveError('');
  };

  // Upload bill → try direct PDF text extraction first → fall back to OCR → smart parse → fill form
  const handleBillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setOcrProgress(t('ocrLocal'));
    setSaveError('');
    setOcrSuccess(null);
    try {
      // ── Step 1: For PDFs, try direct text extraction first (no OCR needed) ──
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        setOcrProgress(`${t('ocrLocal')} — reading PDF...`);
        try {
          const pdfResult = await extractPdfTextDirect(f);
          if (pdfResult.hasText && pdfResult.items.length > 10) {
            const hasNoMarkers = pdfResult.items.some((i) => /^no\s*[:.]/i.test(i.text));
            const hasTotalMarker = pdfResult.items.some((i) => /^total\s*[:.]/i.test(i.text));
            const hasItemLabel = pdfResult.items.some((i) => /^item$/i.test(i.text));

            // Multi-bill patti PDF (has "No:" markers and "Item" labels)
            if (hasNoMarkers && hasItemLabel) {
              const bills = parseMultiBillPdf(pdfResult.items);
              if (bills.length > 0) {
                fillFormFromBills(bills);
                setOcrProgress(null);
                setOcrSuccess(`Extracted ${bills.length} bills from PDF — review and save below.`);
                scrollToForm();
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
              }
            }

            // Credit-ledger PDF (has "Total :" but no "Item" labels)
            if (hasTotalMarker && !hasItemLabel) {
              const entries = parseCreditLedgerPdf(pdfResult.items);
              if (entries.length > 0) {
                fillFormFromLedger(entries);
                setOcrProgress(null);
                setOcrSuccess(`Extracted ${entries.length} customer entries from Mandi Ledger — review and save below.`);
                scrollToForm();
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
              }
            }

            // Generic PDF with text — try smart parser
            const parsed = parseBillSmart(pdfResult.text);
            if (parsed.items.length > 0) {
              fillFormFromParsed(parsed);
              setOcrProgress(null);
              setOcrSuccess(`Extracted ${parsed.items.length} items from PDF — review and save below.`);
              scrollToForm();
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }
          }
        } catch (directErr) {
          console.warn('Direct PDF text extraction failed, falling back to OCR:', directErr);
        }
      }

      // ── Step 2: Fall back to OCR (PaddleOCR → Tesseract) ──
      let ocrText = '';
      let ocrLines: PaddleOcrLine[] | undefined;

      try {
        const result = await recognizeWithPaddle(f, (p: PaddleProgress) => {
          if (p.status === 'loading_model') {
            setOcrProgress(`${t('ocrLocal')} — loading model...`);
          } else if (p.status === 'loading_pdf') {
            setOcrProgress(`${t('ocrLocal')} — opening PDF...`);
          } else if (p.status === 'rendering_pdf') {
            setOcrProgress(`${t('ocrLocal')} — rendering PDF ${Math.round((p.progress || 0) * 100)}%...`);
          } else if (p.status === 'recognizing') {
            const pct = Math.round((p.progress || 0) * 100);
            setOcrProgress(`${t('ocrLocal')} — reading bill${pct > 0 ? ` ${pct}%` : ''}...`);
          }
        });
        ocrText = result.text;
        ocrLines = result.lines;
      } catch (paddleErr) {
        console.warn('PaddleOCR failed, falling back to Tesseract:', paddleErr);
        setOcrProgress(`${t('ocrLocal')} (Tesseract) — 0%`);
        ocrText = await recognizeBill(f, ocrLangs, (m: OcrProgress) => {
          setOcrProgress(`${t('ocrLocal')} (Tesseract) — ${Math.round((m.progress || 0) * 100)}%`);
        });
      }

      const parsed = parseBillSmart(ocrText, ocrLines);
      if (parsed.items.length > 0) {
        fillFormFromParsed(parsed);
        setOcrProgress(null);
        setOcrSuccess(`Extracted ${parsed.items.length} items from bill — review and save below.`);
        scrollToForm();
      } else {
        setOcrProgress(null);
        setSaveError(t('ocrCouldNotRead'));
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setOcrProgress(null);
      setSaveError(err.message || t('ocrFailedError'));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  function scrollToForm() {
    setTimeout(() => {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  // ── Helper: match a customer name to existing DB customers ──
  function matchCustomer(name: string, phone?: string | null): string | null {
    const lowerName = name.toLowerCase().trim();
    // 1. Exact name match (including localized names)
    const exactMatch = customers.find(
      (c) =>
        c.name.toLowerCase() === lowerName ||
        (c.englishName?.toLowerCase() === lowerName) ||
        (c.teluguName?.toLowerCase() === lowerName) ||
        (c.hindiName?.toLowerCase() === lowerName),
    );
    if (exactMatch) return exactMatch.id;
    // 2. Match by phone number
    if (phone) {
      const phoneMatch = customers.find(
        (c) => c.phone && c.phone.replace(/\D/g, '').endsWith(phone.replace(/\D/g, '').slice(-10)),
      );
      if (phoneMatch) return phoneMatch.id;
    }
    // 3. Fuzzy name match (case-insensitive contains)
    const fuzzyMatch = customers.find(
      (c) =>
        c.name.toLowerCase().includes(lowerName) ||
        lowerName.includes(c.name.toLowerCase()),
    );
    return fuzzyMatch?.id || null;
  }

  // ── Helper: match a farmer name to existing suppliers ──
  function matchFarmer(name: string): string {
    const lowerFarmer = name.toLowerCase().trim();
    const exactFarmer = farmerNames.find((n) => n.toLowerCase() === lowerFarmer);
    if (exactFarmer) return exactFarmer;
    const fuzzyFarmer = farmerNames.find(
      (n) => n.toLowerCase().includes(lowerFarmer) || lowerFarmer.includes(n.toLowerCase()),
    );
    return fuzzyFarmer || name;
  }

  // ── Fill form from a single parsed bill (OCR or direct text) ──
  function fillFormFromParsed(parsed: ReturnType<typeof parseBillSmart>) {
    if (parsed.date) setDate(parsed.date);
    const customerName = parsed.customerName;
    const matchedCustomerId = customerName ? matchCustomer(customerName, parsed.customerPhone) : null;
    let matchedFarmerName = '';
    if (parsed.farmerName) matchedFarmerName = matchFarmer(parsed.farmerName);

    ocrImportRef.current = {
      commodityRawToConfirmed: new Map(
        parsed.items.map((it) => [it.commodity.toLowerCase().trim(), it.commodityConfirmed]),
      ),
      customerRawToConfirmed: new Map(
        customerName ? [[customerName.toLowerCase().trim(), { name: customerName, id: matchedCustomerId }]] : [],
      ),
    };

    if (parsed.items.length === 0) {
      setOcrProgress(null);
      setSaveError(t('ocrCouldNotRead'));
      return;
    }

    const byCommodity = new Map<string, SmartBillItem[]>();
    for (const it of parsed.items) {
      const name = it.commodityConfirmed || it.commodity || 'Item';
      if (!byCommodity.has(name)) byCommodity.set(name, []);
      byCommodity.get(name)!.push(it);
    }

    const lots: Lot[] = [];
    for (const [commodity, groupItems] of byCommodity) {
      const lines: Line[] = groupItems.map((it) => ({
        id: newId(),
        commodity,
        bags: it.bags !== null ? String(it.bags) : '',
        bagWeights: [],
        customerName: customerName || '',
        customerId: matchedCustomerId,
        weightKg: it.weightKg !== null ? String(it.weightKg) : '',
        weightMode: 'per_bag' as const,
        pricePerKg: it.rate !== null ? String(it.rate) : '',
        amount: String(it.amount || ''),
        cash: false,
        hamali: '',
      }));
      lots.push({ id: newId(), commodity, bags: '', kg: '', avg: '', lines });
    }

    let newBlockId: string | null = null;
    setBlocks((prev) => {
      const farmerName = matchedFarmerName || '';
      const farmerPhone = farmerName ? (farmerPhones[farmerName] || parsed.farmerPhone || '') : '';
      if (prev.length === 0 || (prev.length === 1 && !prev[0].farmerName.trim() && prev[0].lots.length === 0)) {
        const newBlock = { ...emptyFarmer(commissionPct), farmerName, farmerPhone, lots };
        newBlockId = newBlock.id;
        return [newBlock];
      }
      if (farmerName && !prev[0].farmerName.trim()) {
        const next = [...prev];
        next[0] = { ...next[0], farmerName, farmerPhone, lots: [...next[0].lots, ...lots] };
        return next;
      }
      const next = [...prev];
      next[0] = { ...next[0], lots: [...next[0].lots, ...lots] };
      return next;
    });
    if (newBlockId) setActiveTabId(newBlockId);

    if (parsed.charges.length > 0) {
      setBlocks((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const block = { ...next[0] };
        for (const ch of parsed.charges) {
          const lowName = ch.name.toLowerCase();
          if (lowName.includes('hamali') || lowName.includes('loading')) block.hamaliTotal = String(ch.amount);
          else if (lowName.includes('commission')) block.commissionPct = String(ch.amount);
          else if (lowName.includes('bardan') || lowName.includes('bardana')) block.bardan = String(ch.amount);
          else if (lowName.includes('freight') || lowName.includes('transport')) block.freight = String(ch.amount);
          else if (lowName.includes('advance')) block.advance = String(ch.amount);
          else block.other = String(ch.amount);
        }
        next[0] = block;
        return next;
      });
    }
  }

  // ── Fill form from multiple parsed bills (multi-bill patti PDF) ──
  function fillFormFromBills(bills: ParsedBill[]) {
    // Set date from first bill that has one
    const firstDate = bills.find((b) => b.date)?.date;
    if (firstDate) setDate(firstDate);

    // Build lots — each bill becomes a line
    const lines: Line[] = bills.map((b) => {
      const matchedId = matchCustomer(b.customerName);
      const isCash = b.customerName.toUpperCase().includes('CASH');
      return {
        id: newId(),
        commodity: b.commodity || 'Produce',
        bags: '',
        bagWeights: [],
        customerName: b.customerName,
        customerId: matchedId,
        weightKg: b.qty || '',
        weightMode: 'per_bag' as const,
        pricePerKg: b.rate || '',
        amount: String(b.amount || ''),
        cash: isCash,
        hamali: '',
      };
    });

    // Group by commodity
    const byCommodity = new Map<string, Line[]>();
    for (const ln of lines) {
      const key = ln.commodity;
      if (!byCommodity.has(key)) byCommodity.set(key, []);
      byCommodity.get(key)!.push(ln);
    }

    const lots: Lot[] = [];
    for (const [commodity, groupLines] of byCommodity) {
      lots.push({ id: newId(), commodity, bags: '', kg: '', avg: '', lines: groupLines });
    }

    // Set into the first farmer block
    let newBlockId: string | null = null;
    setBlocks((prev) => {
      if (prev.length === 0 || (prev.length === 1 && !prev[0].farmerName.trim() && prev[0].lots.length === 0)) {
        const newBlock = { ...emptyFarmer(commissionPct), lots };
        newBlockId = newBlock.id;
        return [newBlock];
      }
      const next = [...prev];
      next[0] = { ...next[0], lots: [...next[0].lots, ...lots] };
      return next;
    });
    if (newBlockId) setActiveTabId(newBlockId);

    // Track for self-learning
    ocrImportRef.current = {
      commodityRawToConfirmed: new Map(),
      customerRawToConfirmed: new Map(
        bills.map((b) => [b.customerName.toLowerCase().trim(), {
          name: b.customerName,
          id: matchCustomer(b.customerName),
        }]),
      ),
    };
  }

  // ── Fill form from credit-ledger entries (Mandi Ledger PDF) ──
  function fillFormFromLedger(entries: ParsedLedgerEntry[]) {
    // Each entry becomes a sale line with customer name + amount
    const lines: Line[] = entries.map((e) => {
      const matchedId = matchCustomer(e.customerName);
      return {
        id: newId(),
        commodity: 'Produce',
        bags: '',
        bagWeights: [],
        customerName: e.customerName,
        customerId: matchedId,
        weightKg: '',
        weightMode: 'per_bag' as const,
        pricePerKg: '',
        amount: String(e.amount),
        cash: false,
        hamali: '',
      };
    });

    // Group into one lot
    const lots: Lot[] = [{ id: newId(), commodity: 'Produce', bags: '', kg: '', avg: '', lines }];

    let newBlockId: string | null = null;
    setBlocks((prev) => {
      if (prev.length === 0 || (prev.length === 1 && !prev[0].farmerName.trim() && prev[0].lots.length === 0)) {
        const newBlock = { ...emptyFarmer(commissionPct), lots };
        newBlockId = newBlock.id;
        return [newBlock];
      }
      const next = [...prev];
      next[0] = { ...next[0], lots: [...next[0].lots, ...lots] };
      return next;
    });
    if (newBlockId) setActiveTabId(newBlockId);

    ocrImportRef.current = {
      commodityRawToConfirmed: new Map(),
      customerRawToConfirmed: new Map(
        entries.map((e) => [e.customerName.toLowerCase().trim(), {
          name: e.customerName,
          id: matchCustomer(e.customerName),
        }]),
      ),
    };
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
        {/* Upload bill — Tesseract OCR (free, local, no Gemini) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.avif,.tiff,.tif"
          onChange={handleBillUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!ocrProgress}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40"
        >
          {ocrProgress ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
              {ocrProgress}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {t('uploadBill')}
            </span>
          )}
        </button>
      </div>

      {/* OCR success notification */}
      {ocrSuccess && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--bg-success)] bg-[var(--bg-success)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--bg-success)]">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {ocrSuccess}
          </span>
          <button type="button" onClick={() => setOcrSuccess(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>
      )}

      <div ref={formTopRef} />

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
                onPointerDown={(e) => {
                  // Hidden: long-press (600ms) the farmer tab name to open commission editor
                  // Only available to admin profile — data entry users cannot access this
                  if (userProfile !== 'owner') return;
                  const name = block.farmerName.trim();
                  if (!name) return;
                  const target = e.currentTarget;
                  const timer = setTimeout(() => {
                    setCommissionEditName(name);
                    setCommissionEditValue(block.commissionPct);
                    setShowCommissionEditor(true);
                  }, 600);
                  const cancel = () => clearTimeout(timer);
                  target.addEventListener('pointerup', cancel, { once: true });
                  target.addEventListener('pointerleave', cancel, { once: true });
                }}
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
                    const comm = farmerCommissions[name] || commissionPct;
                    patchBlock(block.id, (b) => ({ ...b, farmerName: name, farmerPhone: phone, commissionPct: comm }));
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
                      if (lot.commodity.trim()) {
                        rememberItem(lot.commodity.trim());
                        // Self-learning: suggest the last known rate for this commodity
                        fetch(`/api/rates?commodity=${encodeURIComponent(lot.commodity.trim())}&latest=true`)
                          .then((r) => r.json())
                          .then((d) => {
                            if (d.rate && d.rate.rate > 0) {
                              const suggestedRate = String(d.rate.rate);
                              patchLot(block.id, lot.id, (l) => ({
                                ...l,
                                lines: l.lines.map((ln) =>
                                  !ln.pricePerKg ? { ...ln, pricePerKg: suggestedRate } : ln,
                                ),
                              }));
                            }
                          })
                          .catch(() => {});
                      }
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
                        /* Single total weight input — small like per-bag, with Done button */
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={line.weightKg}
                            placeholder="total kg"
                            aria-label="Total weight kg"
                            className="h-7 w-16 rounded border border-[var(--border-input)] bg-[var(--bg-base)] px-1 text-center text-[10px] text-[var(--text-primary)] tabular-nums"
                            onChange={(e) =>
                              patchLotLine(block.id, lot.id, line.id, (ln) =>
                                fillLine(ln, { commodity: lot.commodity, weightKg: e.target.value }, rateUnit, 'totalWeight'),
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                          />
                          {num(line.weightKg) > 0 && (
                            <button
                              type="button"
                              className="text-[9px] text-[var(--text-muted)] underline"
                              onClick={() => setWeightsExpanded((s) => ({ ...s, [line.id]: false }))}
                            >
                              done
                            </button>
                          )}
                        </div>
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
              {/* Hamali — auto-calculated from Bowenpally market rates.
                  Shows the auto value as placeholder; admin can override by typing.
                  Click the label to see per-commodity breakdown. */}
              <div className="relative flex flex-col gap-0.5">
                <button
                  type="button"
                  className="text-[10px] text-[var(--text-muted)] text-left hover:text-[var(--text-primary)]"
                  onClick={() => userProfile === 'owner' && setShowHamaliBreakdown(showHamaliBreakdown === block.id ? null : block.id)}
                >
                  {t('hamali')} {userProfile === 'owner' && tot.hamaliBreakdown.length > 0 && <span className="text-[var(--text-faint)]">ⓘ</span>}
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={block.hamaliTotal}
                  placeholder={
                    !num(block.hamaliTotal) && hamaliRates.length > 0 && tot.validLines.length > 0
                      ? String(Math.round(tot.hamali))
                      : '0'
                  }
                  onChange={(e) => patchBlock(block.id, (b) => ({ ...b, hamaliTotal: e.target.value }))}
                  className="h-7 w-16 rounded border border-[var(--border-input)] bg-[var(--bg-base)] px-1 text-center text-xs text-[var(--text-primary)] tabular-nums"
                />
                {showHamaliBreakdown === block.id && tot.hamaliBreakdown.length > 0 && (
                  <div className="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-2 shadow-lg">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-[var(--text-primary)]">Hamali Breakdown (Seller Share)</span>
                      <button type="button" className="text-[10px] text-[var(--text-muted)]" onClick={() => setShowHamaliBreakdown(null)}>✕</button>
                    </div>
                    {tot.hamaliBreakdown.map((h, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 border-t border-[var(--border-input)] py-0.5 text-[10px]">
                        <div className="flex-1">
                          <div className="text-[var(--text-primary)]">{h.commodity}</div>
                          <div className="text-[var(--text-muted)]">{h.bags} bags × ₹{h.perBag.toFixed(2)}/bag</div>
                        </div>
                        <div className="font-medium text-[var(--text-primary)]">₹{h.total.toFixed(2)}</div>
                      </div>
                    ))}
                    <div className="mt-1 flex items-center justify-between border-t-2 border-[var(--border-card)] pt-1 text-[11px] font-bold">
                      <span className="text-[var(--text-primary)]">Total</span>
                      <span className="text-[var(--text-primary)]">₹{tot.hamali.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
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

      {/* Hidden commission editor — opened by long-pressing the commission label */}
      {showCommissionEditor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCommissionEditor(false)}
        >
          <div
            className="w-80 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Commission %</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Set commission percentage for <b>{commissionEditName}</b>. This is saved per farmer and auto-applied when selected. Employees cannot see or change this.
            </p>
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={commissionEditValue}
              onChange={(e) => setCommissionEditValue(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-2 text-sm"
              placeholder="e.g. 10"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  // Save to DB
                  const farmerId = farmerIds[commissionEditName];
                  if (farmerId) {
                    try {
                      await fetch(`/api/suppliers/${farmerId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ commissionPct: commissionEditValue }),
                      });
                    } catch (e) { /* ignore — will retry on save */ }
                  }
                  // Update local maps
                  const val = commissionEditValue.trim();
                  setFarmerCommissions((prev) => ({ ...prev, [commissionEditName]: val }));
                  // Update the active block
                  setBlocks((prev) => prev.map((b) =>
                    b.farmerName.trim() === commissionEditName
                      ? { ...b, commissionPct: val || commissionPct }
                      : b
                  ));
                  setShowCommissionEditor(false);
                }}
                className="flex-1 rounded-lg bg-[var(--bg-primary)] px-3 py-2 text-sm font-medium text-[var(--text-on-primary)]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowCommissionEditor(false)}
                className="flex-1 rounded-lg border border-[var(--border-input)] px-3 py-2 text-sm text-[var(--text-muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live transactions — saved sales appear here on the same page */}
      {savedSales.length > 0 && (
        <section className="rounded-2xl bg-[var(--bg-card)] p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-muted)]">
              {t('salesToday')} — {savedSales.length} {t('lines')}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <PrintShareMenu
                label={t('printShare')}
                options={[
                  // Consolidated options only — per-transaction share
                  // is already available beside each row
                  {
                    key: 'all-pattis',
                    label: t('printAllPattis'),
                    onPrint: printAllPattis,
                  },
                  {
                    key: 'bills',
                    label: `${t('printCustomerBills')} — ALL (${date})`,
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
                  <th className="py-1.5 pr-2 text-right">Time</th>
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
                    <td className="py-1.5 pr-2 text-right text-xs text-[var(--text-muted)] whitespace-nowrap">{fmtTime(s.createdAt)}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center justify-center gap-1">
                        <span className="relative" data-share-dropdown>
                          <button
                            type="button"
                            onClick={() => setShowShareFor(showShareFor === s.txnId ? null : s.txnId)}
                            className="rounded px-1.5 py-0.5 text-xs text-[var(--bg-primary)] hover:bg-[var(--bg-base)]"
                            title={t('printShare')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'middle'}}>
                              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                            </svg>
                          </button>
                          {showShareFor === s.txnId && (
                            <div className="absolute right-0 top-full z-50 mt-1 flex flex-col gap-1 rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => { setShowShareFor(null); printSale(s); }}
                                className="whitespace-nowrap rounded-md bg-[var(--bg-base)] px-3 py-1.5 text-xs hover:bg-[var(--bg-card-hover)]"
                              >
                                🖨 Print
                              </button>
                              <button
                                type="button"
                                onClick={() => { setShowShareFor(null); shareSale(s); }}
                                className="whitespace-nowrap rounded-md bg-[var(--bg-base)] px-3 py-1.5 text-xs hover:bg-[var(--bg-card-hover)]"
                              >
                                <span style={{color:'#25D366'}}>WhatsApp</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowShareFor(null)}
                                className="whitespace-nowrap rounded-md bg-[var(--bg-base)] px-3 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]"
                              >
                                ✕ Cancel
                              </button>
                            </div>
                          )}
                        </span>
                        {s.customerId && (
                          <Link
                            href={`/customers/${s.customerId}`}
                            className="rounded px-1.5 py-0.5 text-xs text-[var(--bg-primary)] hover:bg-[var(--bg-base)]"
                            title={t('edit')}
                          >
                            ✎
                          </Link>
                        )}
                        {s.txnId && (
                          <button
                            type="button"
                            onClick={() => deleteSavedSale(s.txnId)}
                            className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
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
