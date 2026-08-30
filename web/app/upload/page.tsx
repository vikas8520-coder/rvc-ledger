'use client';

import { useState, useCallback, useEffect } from 'react';
import { recognizeBill, OcrProgress, smartRecognizeBill, SmartOcrProgress, OcrSource, GeminiBill, DailySummary } from '@/lib/ocr';
import { parseBillText, buildDisplay } from '@/lib/parser';
import { BillItem } from '@/lib/types';
import { classifyScript, setRuntimeAliases, getRuntimeAlias } from '@/lib/catalog';
import { printBill, BillFormat, ShopProfile } from '@/lib/billPrint';
import {
  MARKET_YARDS,
  EMPTY_MARKET,
  apmcCess,
  apmcFee,
  chargeLabel,
  commissionOn,
  goodsTotal,
  yardById,
  type ChargeCode,
  type ChargeKind,
  type MarketMeta,
} from '@/lib/market';
import { useI18n } from '../components/I18nProvider';
import CustomerPicker, { CustomerOption } from '../components/CustomerPicker';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

interface EditableItem {
  raw: string;
  confirmed: string;
  qty: string;
  rate: string;
  amount: number;
  kind?: ChargeKind;
  chargeCode?: ChargeCode | null;
}

export default function UploadPage() {
  const { t, ocrLangs } = useI18n();
  const [step, setStep] = useState<'idle' | 'ocr' | 'review' | 'saving' | 'done'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<SmartOcrProgress | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrSource, setOcrSource] = useState<OcrSource | null>(null);
  const [geminiBills, setGeminiBills] = useState<GeminiBill[]>([]);
  const [selectedBillIdx, setSelectedBillIdx] = useState(0);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);

  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState('');

  const [date, setDate] = useState('');
  const [billNo, setBillNo] = useState('');
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualLine, setManualLine] = useState('');
  const [saveError, setSaveError] = useState('');
  const [market, setMarket] = useState<MarketMeta>(EMPTY_MARKET);
  const [commissionPct, setCommissionPct] = useState('4');
  const [shopSettings, setShopSettings] = useState<ShopProfile>({});
  const [savedItems, setSavedItems] = useState<BillItem[]>([]);
  const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => {
        const list: CustomerOption[] = data.customers || [];
        setCustomerList(list);
        const srs = list.find((c) => c.name === 'SRS Hostels');
        if (srs) {
          setCustomerId(srs.id);
          setCustomer(srs.name);
        } else if (list.length > 0) {
          setCustomerId(list[0].id);
          setCustomer(list[0].name);
        }
      })
      .catch(() => {});
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setShopSettings(d.settings || {}))
      .catch(() => {});
    // Fetch learned aliases so OCR parser can use them
    fetch('/api/catalog/aliases')
      .then((r) => r.json())
      .then((d) => {
        if (d.aliases) {
          setLearnedAliases(d.aliases);
          setRuntimeAliases(d.aliases);
        }
      })
      .catch(() => {});
  }, []);

  const canSave = (!!customerId || !!customer.trim()) && !!date;

  // Load a Gemini-extracted structured bill into the form fields
  const loadGeminiBill = (bill: GeminiBill) => {
    // Set customer — try to match from existing list
    if (bill.customer_name) {
      const existing = customerList.find(
        (c) => c.name.toLowerCase() === bill.customer_name!.toLowerCase()
      );
      if (existing) {
        setCustomerId(existing.id);
        setCustomer(existing.name);
      } else {
        // New customer from OCR — clear selection, keep name for auto-create
        setCustomerId(null);
        setCustomer(bill.customer_name);
      }
    }

    setDate(bill.date || '');
    setBillNo(bill.bill_no || '');
    setTotal(bill.total_amount || 0);

    // Convert entries (bags/weight/name) into item rows
    // Prepend product name (e.g. "Mirchi") if available from daily summary
    const productName = dailySummary?.product_name;
    const editable = (bill.entries || []).map((entry) => {
      const entryName = entry.name || '';
      const fullDesc = productName ? `${productName} — ${entryName}` : entryName;
      return {
        raw: fullDesc,
        confirmed: fullDesc,
        qty: entry.weight_kg ? `${entry.weight_kg} kg` : (entry.bags ? `${entry.bags} bags` : ''),
        rate: '',
        amount: 0,
        kind: 'item' as const,
        chargeCode: null,
      };
    });
    setItems(editable);
    setUnparsed([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStep('ocr');
    setProgress(null);
    setSaveError('');
    setOcrSource(null);

    // Reset all fields from any previous upload
    setOcrText('');
    setOcrSource(null);
    setGeminiBills([]);
    setSelectedBillIdx(0);
    setDailySummary(null);
    setCustomerId(null);
    setCustomer('');
    setDate('');
    setBillNo('');
    setTotal(0);
    setItems([]);
    setUnparsed([]);
    try {
      const result = await smartRecognizeBill(f, ocrLangs, (m: SmartOcrProgress) => {
        setProgress(m);
      });
      setOcrText(result.text);
      setOcrSource(result.source);

      // If Gemini returned structured bills, use those directly
      if (result.bills && result.bills.length > 0) {
        setGeminiBills(result.bills);
        setDailySummary(result.dailySummary || null);
        // Load the first bill into the form
        loadGeminiBill(result.bills[0]);
        setStep('review');
        return;
      }

      // Fallback: parse raw text with the existing parser
      const parsed = parseBillText(result.text);

      setDate(parsed.date || '');
      setBillNo(parsed.billNo || '');
      setTotal(parsed.total);
      setMarket(parsed.market || EMPTY_MARKET);

      const editable = parsed.items.map((it) => ({
        raw: it.raw_text,
        confirmed: it.confirmed_name,
        qty: it.qty || '',
        rate: it.rate || '',
        amount: it.amount,
        kind: it.kind || 'item',
        chargeCode: it.chargeCode || null,
      }));

      // Add empty manual rows for unparsed lines
      setUnparsed(parsed.unparsedLines);
      setItems(editable);
      setStep('review');
    } catch (err: any) {
      setSaveError(err.message || 'OCR failed');
      setStep('idle');
    }
  };

  const recalc = useCallback((list: EditableItem[]) => {
    const sum = list.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    setTotal(sum);
  }, []);

  const updateItem = (idx: number, field: keyof EditableItem, value: string) => {
    const next = [...items];
    if (field === 'amount') {
      next[idx].amount = Number(value) || 0;
    } else {
      (next[idx] as any)[field] = value;
    }
    if (field === 'confirmed' || field === 'raw') {
      const { guess } = classifyScript(value);
      next[idx].confirmed = guess || value;
    }
    setItems(next);
    recalc(next);
  };

  const addUnparsed = () => {
    if (!manualLine) return;
    const parts = manualLine.trim().split(/\s+/);
    const amount = Number(parts[parts.length - 1]) || 0;
    const raw = manualName || parts.slice(0, Math.max(1, parts.length - 1)).join(' ');
    const { guess } = classifyScript(raw);
    const next = [
      ...items,
      { raw, confirmed: guess || raw, qty: '', rate: '', amount },
    ];
    setItems(next);
    setManualName('');
    setManualLine('');
    recalc(next);
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    recalc(next);
  };

  const updateMarket = (patch: Partial<MarketMeta>) => {
    setMarket((prev) => {
      const next = { ...prev, ...patch };
      if (patch.marketYard) {
        const yard = yardById(patch.marketYard);
        if (yard) next.marketType = yard.type;
      }
      return next;
    });
  };

  const addCharge = (code: ChargeCode, amount: number, extra?: string) => {
    const name = chargeLabel(code, extra);
    const next = [
      ...items,
      { raw: name, confirmed: name, qty: '', rate: extra || '', amount, kind: 'charge' as const, chargeCode: code },
    ];
    setItems(next);
    recalc(next);
  };

  const goods = goodsTotal(items);
  const chargesSum = items.filter((it) => it.kind === 'charge').reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const handleSave = async () => {
    setStep('saving');
    setSaveError('');
    try {
      const billItems: BillItem[] = items.map((it) => ({
        raw_text: it.raw,
        confirmed_name: it.confirmed,
        qty: it.qty || null,
        rate: it.rate || null,
        amount: it.amount,
        display: buildDisplay(it.qty || null, it.rate || null, it.amount),
        kind: it.kind || 'item',
        chargeCode: it.chargeCode || null,
      }));

      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customer,
          customerId,
          date,
          billNo,
          total,
          items: billItems,
          market,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStep('done');
      // Store for printing
      setSavedItems(billItems);

      // Auto-learn: save aliases for every item where the user corrected the name.
      // This happens in the background — no button click needed.
      // Only for actual items (not charges), and only when raw != confirmed meaning.
      for (const it of items) {
        if (it.kind === 'charge') continue;
        if (!it.raw.trim() || !it.confirmed.trim()) continue;
        const meaning = it.confirmed.match(/\(([^)]+)\)$/)?.[1]?.trim() || it.confirmed.trim();
        const rawLower = it.raw.trim().toLowerCase();
        // Only save if this correction isn't already known
        if (learnedAliases[rawLower] !== meaning) {
          try {
            await fetch('/api/catalog/aliases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ alias: it.raw.trim(), itemName: meaning }),
            });
          } catch {}
        }
      }
      // Refresh learned aliases in memory
      try {
        const ar = await fetch('/api/catalog/aliases');
        const ad = await ar.json();
        if (ad.aliases) {
          setLearnedAliases(ad.aliases);
          setRuntimeAliases(ad.aliases);
        }
      } catch {}
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
      setStep('review');
    }
  };

  const printSavedUploadBill = (format: BillFormat) => {
    printBill(
      {
        customerName: customer,
        date,
        billNo: billNo || null,
        items: savedItems.map((it) => ({
          name: it.confirmed_name,
          qty: it.qty,
          rate: it.rate,
          amount: it.amount,
          display: it.display || '',
          kind: it.kind,
          chargeCode: it.chargeCode,
        })),
        total,
        market,
      },
      shopSettings,
      format
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('uploadBill')}</h1>

      {step === 'idle' && (
        <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-[var(--border-input)] bg-[var(--bg-card)] p-10 text-center">
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <p className="text-lg font-medium">{t('tapToChooseBill')}</p>
          <p className="text-sm text-[var(--text-faint)]">{t('pngOrJpg')}</p>
        </label>
      )}

      {step === 'ocr' && (
        <div className="rounded-2xl bg-[var(--bg-card)] p-6 text-center">
          <p className="mb-2 font-medium">{t('readingBill')}</p>
          {progress && (
            <div>
              <p className="text-sm text-[var(--text-muted)]">
                {progress.status === 'local_ocr' && t('ocrLocal')}
                {progress.status === 'ai_ocr' && t('ocrAI')}
                {progress.status === 'ai_ocr_failed' && t('ocrAIFailed')}
                {progress.status === 'done' && progress.source === 'gemini' ? t('ocrAIDone') :
                  progress.status === 'done' ? t('ocrLocalDone') :
                  !['local_ocr', 'ai_ocr', 'ai_ocr_failed', 'done'].includes(progress.status) ? progress.status : ''}
              </p>
              <div className="mt-2 h-2 w-full rounded bg-[var(--bg-card-hover)]">
                <div
                  className={`h-2 rounded ${progress.status === 'ai_ocr' || progress.source === 'gemini' ? 'bg-[var(--bg-success)]' : 'bg-[var(--bg-primary)]'}`}
                  style={{ width: `${Math.max(5, progress.progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          {ocrSource && (
            <div className={`rounded-lg px-3 py-1.5 text-xs ${ocrSource === 'gemini' ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-on-primary)]'}`}>
              {ocrSource === 'gemini' ? `✓ ${t('ocrAIBadge')}` : `✓ ${t('ocrLocalBadge')}`}
            </div>
          )}
          {dailySummary && (dailySummary.product_name || dailySummary.bags_covers || dailySummary.bigbags || dailySummary.total_bags) && (
            <div className="rounded-2xl bg-[var(--bg-card)] p-4">
              <p className="mb-2 text-sm font-medium">
                Today's Stock Summary{dailySummary.product_name ? ` — ${dailySummary.product_name}` : ''}
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold">{dailySummary.bags_covers ?? '?'}</p>
                  <p className="text-xs text-[var(--text-muted)]">Bags / Covers</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{dailySummary.bigbags ?? '?'}</p>
                  <p className="text-xs text-[var(--text-muted)]">Big Bags / Bastas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{dailySummary.total_bags ?? '?'}</p>
                  <p className="text-xs text-[var(--text-muted)]">Total</p>
                </div>
              </div>
              {dailySummary.notes && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">Notes: {dailySummary.notes}</p>
              )}
            </div>
          )}
          {geminiBills.length > 1 && (
            <div className="rounded-2xl bg-[var(--bg-card)] p-4">
              <p className="mb-2 text-sm font-medium">Multiple bills found in this image ({geminiBills.length})</p>
              <div className="flex flex-wrap gap-2">
                {geminiBills.map((bill, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedBillIdx(idx);
                      loadGeminiBill(bill);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm ${idx === selectedBillIdx ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-on-primary)]'}`}
                  >
                    {bill.customer_name || `Bill ${idx + 1}`}
                    {bill.total_amount ? ` · ₹${bill.total_amount}` : ''}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Review and save each bill one at a time. Click a name to load that bill.</p>
            </div>
          )}
          <section className="rounded-2xl bg-[var(--bg-card)] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('customer')}</label>
                <CustomerPicker
                  customers={customerList}
                  value={customerId}
                  onChange={(cid, cname) => {
                    setCustomerId(cid);
                    setCustomer(cname);
                  }}
                  placeholder={t('selectCustomer')}
                />
                {!customerId && customer.trim() && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t('saveAsNewCustomer')} <strong>{customer}</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('date')}</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('billNo')}</label>
                <input
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
                />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('marketYard')}</label>
                <select
                  value={market.marketYard}
                  onChange={(e) => updateMarket({ marketYard: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
                >
                  {MARKET_YARDS.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('marketType')}</label>
                <select
                  value={market.marketType}
                  onChange={(e) => updateMarket({ marketType: e.target.value as MarketMeta['marketType'] })}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
                >
                  <option value="apmc">{t('apmc')}</option>
                  <option value="rythu">{t('rythu')}</option>
                  <option value="local">{t('local')}</option>
                  <option value="other">{t('other')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('seller')}</label>
                <input
                  value={market.sellerName}
                  onChange={(e) => updateMarket({ sellerName: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('lotNo')}</label>
                <input
                  value={market.lotNo}
                  onChange={(e) => updateMarket({ lotNo: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t('vehicleNo')}</label>
                <input
                  value={market.vehicleNo}
                  onChange={(e) => updateMarket({ vehicleNo: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
                />
              </div>
            </div>
            <div className="mt-3 text-right">
              <p className="text-sm text-[var(--text-muted)]">{t('goods')}: {fmt(goods)} · {t('charges')}: {fmt(chargesSum)}</p>
              <p className="text-2xl font-bold">{t('total')}: {fmt(total)}</p>
            </div>
          </section>

          <section className="rounded-2xl bg-[var(--bg-card)] p-4">
            <h2 className="mb-3 font-semibold">{t('items')}</h2>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const rawLower = it.raw.trim().toLowerCase();
                const alreadyLearned = learnedAliases[rawLower] === (it.confirmed.match(/\(([^)]+)\)$/)?.[1]?.trim() || it.confirmed.trim());
                return (
                <div key={idx} className="grid gap-2 rounded-xl bg-[var(--bg-base)] p-3 sm:grid-cols-12">
                  <input
                    value={it.raw}
                    onChange={(e) => updateItem(idx, 'raw', e.target.value)}
                    className="col-span-3 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                    placeholder={t('rawName')}
                  />
                  <div className="col-span-4 flex gap-1">
                    <input
                      value={it.confirmed}
                      onChange={(e) => updateItem(idx, 'confirmed', e.target.value)}
                      className={`flex-1 rounded border bg-[var(--bg-input)] p-2 text-sm ${it.kind === 'charge' ? 'border-[#c4a574] italic' : 'border-[var(--border-light)]'}`}
                      placeholder={t('confirmedName')}
                    />
                    {alreadyLearned && it.kind !== 'charge' && (
                      <span className="shrink-0 self-center text-xs text-[var(--bg-success)]" title={t('aliasKnown')}>✓</span>
                    )}
                  </div>
                  <input
                    value={it.qty}
                    onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                    className="col-span-2 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                    placeholder={t('qty')}
                  />
                  <input
                    value={it.rate}
                    onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                    className="col-span-1 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                    placeholder={t('rate')}
                  />
                  <input
                    type="number"
                    value={it.amount}
                    onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                    className="col-span-1 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                    placeholder={t('amt')}
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="col-span-1 rounded bg-[var(--bg-primary)] text-sm text-[var(--text-on-primary)]"
                  >
                    ×
                  </button>
                </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl bg-[var(--bg-base)] p-3">
              <p className="mb-2 text-sm text-[var(--text-muted)]">{t('chargesHelp')}</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => addCharge('hamali', 0)}
                  className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs text-[var(--text-on-primary)]"
                >
                  {t('addHamali')}
                </button>
                <button
                  type="button"
                  onClick={() => addCharge('market_fee', apmcFee(goods), '1%')}
                  className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs text-[var(--text-on-primary)]"
                >
                  {t('addMarketFee')}
                </button>
                <button
                  type="button"
                  onClick={() => addCharge('cess', apmcCess(apmcFee(goods)), '0.5%')}
                  className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs text-[var(--text-on-primary)]"
                >
                  {t('addCess')}
                </button>
                <button
                  type="button"
                  onClick={() => addCharge('commission', commissionOn(goods, Number(commissionPct) || 0), `${commissionPct}%`)}
                  className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs text-[var(--text-on-primary)]"
                >
                  {t('addCommission')}
                </button>
                <input
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  className="w-16 rounded border border-[var(--border-light)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                  title={t('commission')}
                />
                <span className="self-center text-xs text-[var(--text-muted)]">%</span>
                <button
                  type="button"
                  onClick={() => addCharge('weighing', 0)}
                  className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs text-[var(--text-on-primary)]"
                >
                  {t('addWeighing')}
                </button>
              </div>
              <p className="mb-2 text-sm text-[var(--text-muted)]">{t('addManualItem')}</p>
              <div className="grid gap-2 sm:grid-cols-12">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="col-span-4 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                  placeholder={t('itemName')}
                />
                <input
                  value={manualLine}
                  onChange={(e) => setManualLine(e.target.value)}
                  className="col-span-6 rounded border border-[var(--border-light)] bg-[var(--bg-input)] p-2 text-sm"
                  placeholder={t('qtyRateAmount')}
                />
                <button
                  onClick={addUnparsed}
                  className="col-span-2 rounded bg-[var(--bg-success)] text-sm text-[var(--text-on-primary)]"
                >
                  {t('add')}
                </button>
              </div>
            </div>
          </section>

          {unparsed.length > 0 && (
            <section className="rounded-2xl bg-[var(--bg-card)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--text-faint)]">{t('ocrCouldNotRead')}</h2>
              <ul className="text-sm text-[var(--text-muted)]">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full rounded-xl bg-[var(--bg-primary)] p-4 font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {t('saveBill')}
          </button>
          {saveError && <p className="text-center text-[var(--bg-primary)]">{saveError}</p>}
        </div>
      )}

      {step === 'saving' && (
        <div className="rounded-2xl bg-[var(--bg-card)] p-6 text-center">
          <p className="font-medium">{t('saving')}</p>
        </div>
      )}

      {step === 'done' && (
        <div className="rounded-2xl bg-[var(--bg-card)] p-6 text-center space-y-4">
          <p className="text-xl font-bold">{t('saved')}</p>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('printBill')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => printSavedUploadBill('simple')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
                {t('billFormatSimple')}
              </button>
              <button onClick={() => printSavedUploadBill('itemized')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
                {t('billFormatItemized')}
              </button>
              <button onClick={() => printSavedUploadBill('market')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
                {t('billFormatMarket')}
              </button>
              <button onClick={() => printSavedUploadBill('patti')} className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]">
                {t('billFormatPatti')}
              </button>
            </div>
          </div>
          <a href="/" className="inline-block rounded bg-[var(--bg-primary)] px-4 py-2 text-[var(--text-on-primary)]">{t('viewDashboard')}</a>
        </div>
      )}
    </div>
  );
}
