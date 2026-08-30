'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { smartRecognizeBill, SmartOcrProgress, OcrSource, GeminiBill, DailySummary } from '@/lib/ocr';
import { Charge, CHARGE_TYPES } from '@/lib/charges';
import CustomerPicker, { CustomerOption } from '../components/CustomerPicker';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let idCounter = 0;
function newId() { return `s-${Date.now()}-${idCounter++}`; }
function num(s: string): number { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; }

interface SaleEntry {
  id: string;
  customerId: string | null;
  customerName: string;
  bags: string;
  weightKg: string;
  pricePerKg: string;
  amount: string;
}

export default function SellPage() {
  const { t } = useI18n();
  const [date, setDate] = useState(today());
  const [sales, setSales] = useState<SaleEntry[]>([
    { id: newId(), customerId: null, customerName: '', bags: '', weightKg: '', pricePerKg: '', amount: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // Image upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<SmartOcrProgress | null>(null);
  const [ocrSource, setOcrSource] = useState<OcrSource | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [geminiBills, setGeminiBills] = useState<GeminiBill[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const [charges, setCharges] = useState<Charge[]>([]);
  const [showCharges, setShowCharges] = useState(false);

  // Add new customer modal state
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEnglishName, setNewCustomerEnglishName] = useState('');
  const [newCustomerTeluguName, setNewCustomerTeluguName] = useState('');
  const [newCustomerHindiName, setNewCustomerHindiName] = useState('');
  const [newCustomerCreditLimit, setNewCustomerCreditLimit] = useState('');

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []))
      .catch(() => {});
  }, []);

  const totalBagsSold = sales.reduce((s, e) => s + num(e.bags), 0);
  const totalWeightSold = sales.reduce((s, e) => s + num(e.weightKg), 0);
  const totalSalesAmount = sales.reduce((s, e) => s + num(e.amount), 0);

  // Calculate charge amounts (similar to Receive page)
  const totalBags = totalBagsSold;
  const chargeAmounts = charges.map((c) => {
    if (c.rateType === 'per_bag') return num(c.rate) * totalBags;
    if (c.rateType === 'percent') return (totalSalesAmount * num(c.rate)) / 100;
    return num(c.amount) || num(c.rate);
  });
  const totalCharges = chargeAmounts.reduce((s, a) => s + a, 0);
  const netAfterCharges = totalSalesAmount - totalCharges;

  const addSale = () => {
    const defaultPrice = sales[0]?.pricePerKg || '';
    setSales([...sales, {
      id: newId(), customerId: null, customerName: '', bags: '', weightKg: '', pricePerKg: defaultPrice, amount: '',
    }]);
  };

  const updateSale = (id: string, field: keyof SaleEntry, value: string) => {
    setSales(sales.map((s) => {
      if (s.id !== id) return s;
      const updated = { ...s, [field]: value };
      if (field === 'weightKg' || field === 'pricePerKg') {
        const amt = num(updated.weightKg) * num(updated.pricePerKg);
        updated.amount = amt > 0 ? String(Math.round(amt)) : '';
      }
      return updated;
    }));
  };

  const removeSale = (id: string) => setSales(sales.filter((s) => s.id !== id));

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

  // Load a Gemini bill into the sales rows
  const loadGeminiBill = (bill: GeminiBill) => {
    // Try to match customer from existing list
    const matched = bill.customer_name ? customers.find((c) => c.name.toLowerCase() === bill.customer_name!.toLowerCase()) : null;
    const rows = (bill.entries || []).map((entry) => ({
      id: newId(),
      customerId: matched?.id || null,
      customerName: bill.customer_name || '',
      bags: entry.bags ? String(entry.bags) : '',
      weightKg: entry.weight_kg ? String(entry.weight_kg) : '',
      pricePerKg: '',
      amount: bill.total_amount ? String(bill.total_amount) : '0',
    }));
    if (rows.length > 0) setSales(rows);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setProgress(null);
    setOcrSource(null);
    setGeminiBills([]);
    setDailySummary(null);
    try {
      const result = await smartRecognizeBill(f, 'eng+tel+hin', (m: SmartOcrProgress) => {
        setProgress(m);
      });
      setOcrSource(result.source);
      if (result.bills && result.bills.length > 0) {
        setGeminiBills(result.bills);
        setDailySummary(result.dailySummary || null);
        // Load first bill
        loadGeminiBill(result.bills[0]);
      }
    } catch (err: any) {
      setSaveError(err.message || 'OCR failed');
    } finally {
      setUploading(false);
    }
  };

  const canSave = sales.some((s) => (s.customerId || s.customerName.trim()) && num(s.amount) > 0);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const validSales = sales.filter((s) => (s.customerId || s.customerName.trim()) && num(s.amount) > 0);
      for (const sale of validSales) {
        const items: Array<{
          raw_text?: string;
          confirmed_name?: string;
          name?: string;
          qty: string | null;
          rate: string | null;
          amount: number;
          kind: 'item' | 'charge';
          chargeCode: null;
        }> = [{
          raw_text: 'Produce',
          confirmed_name: 'Produce',
          qty: sale.weightKg ? `${sale.weightKg} kg` : (sale.bags ? `${sale.bags} bags` : ''),
          rate: sale.pricePerKg || null,
          amount: num(sale.amount),
          kind: 'item' as const,
          chargeCode: null,
        }];

        // Add charges as line items
        charges.forEach((c, i) => {
          const amt = chargeAmounts[i];
          if (amt > 0) {
            items.push({
              name: c.label,
              qty: c.rateType === 'per_bag' ? `${c.rate}/bag × ${totalBags}` : c.rateType === 'percent' ? `${c.rate}%` : null,
              rate: null,
              amount: -amt,
              kind: 'charge' as const,
              chargeCode: null,
            });
          }
        });

        const total = num(sale.amount) - chargeAmounts.reduce((s, a) => s + a, 0);
        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: sale.customerName.trim(),
            customerId: sale.customerId,
            date,
            billNo: null,
            total,
            items,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to save bill for ${sale.customerName}`);
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
    setSales([{ id: newId(), customerId: null, customerName: '', bags: '', weightKg: '', pricePerKg: '', amount: '' }]);
    setSaved(false); setSaveError('');
    setGeminiBills([]); setDailySummary(null); setOcrSource(null);
  };

  if (saved) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-[var(--bg-success)] p-6 text-center text-[var(--text-on-primary)]">
          <p className="text-2xl font-bold">✓ Sales Saved</p>
          <p className="mt-1 text-sm opacity-90">
            {sales.filter((s) => s.customerName.trim()).length} bills · {fmt(totalSalesAmount)} total
          </p>
          {totalCharges > 0 && (
            <p className="mt-1 text-sm opacity-90">Deductions: {fmt(totalCharges)} · Net: {fmt(netAfterCharges)}</p>
          )}
        </div>
        <button onClick={reset} className="w-full rounded-lg bg-[var(--bg-primary)] py-3 text-sm font-medium text-[var(--text-on-primary)]">
          New Sales Entry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Record Sales</p>
          <button onClick={() => setShowUpload(!showUpload)}
            className="rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-primary)]">
            📷 Upload Image
          </button>
        </div>

        <div>
          <label className="text-sm text-[var(--text-muted)]">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
        </div>
      </div>

      {/* Image upload section (collapsible) */}
      {showUpload && (
        <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
          <p className="text-xs text-[var(--text-muted)]">Upload a photo of your ledger page. AI will read customer names, bags, and weights for you.</p>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full rounded-lg border border-dashed border-[var(--border-input)] py-3 text-sm text-[var(--text-muted)] disabled:opacity-50">
            {uploading ? 'Reading image...' : '📷 Take photo or choose image'}
          </button>

          {/* Progress */}
          {progress && (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-[var(--bg-secondary)]">
                <div className="h-2 rounded-full bg-[var(--bg-primary)] transition-all" style={{ width: `${(progress.progress || 0) * 100}%` }} />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {progress.source === 'gemini' ? 'AI reading handwriting...' : 'Local OCR...'}
              </p>
            </div>
          )}

          {/* OCR source badge */}
          {ocrSource && (
            <div className={`rounded-lg px-3 py-1.5 text-xs ${ocrSource === 'gemini' ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-on-primary)]'}`}>
              {ocrSource === 'gemini' ? '✓ Read by AI (Gemini)' : '✓ Read locally'}
            </div>
          )}

          {/* Daily summary from image */}
          {dailySummary && (dailySummary.product_name || dailySummary.bags_covers || dailySummary.bigbags) && (
            <div className="rounded-lg bg-[var(--bg-secondary)] p-3 text-xs">
              <p className="font-medium">{dailySummary.product_name || 'Stock'}</p>
              <p>{dailySummary.bags_covers ?? '?'} bags/covers · {dailySummary.bigbags ?? '?'} big bags · {dailySummary.total_bags ?? '?'} total</p>
            </div>
          )}

          {/* Bill picker if multiple customers */}
          {geminiBills.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Found {geminiBills.length} customers. Click to load:</p>
              <div className="flex flex-wrap gap-1.5">
                {geminiBills.map((bill, idx) => (
                  <button key={idx} onClick={() => loadGeminiBill(bill)}
                    className="rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1 text-xs text-[var(--text-primary)]">
                    {bill.customer_name || `Bill ${idx + 1}`}
                    {bill.total_amount ? ` · ${fmt(bill.total_amount)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {saveError && (
            <div className="rounded-lg bg-[var(--bg-error)] p-2 text-xs text-[var(--text-on-primary)]">{saveError}</div>
          )}
        </div>
      )}

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
                        {c.rate}% of {fmt(totalSalesAmount)} = <span className="font-bold">{fmt((totalSalesAmount * num(c.rate)) / 100)}</span>
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
                  <span className="text-[var(--text-muted)]">Gross sales</span>
                  <span>{fmt(totalSalesAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Total deductions</span>
                  <span className="text-[var(--bg-primary)]">-{fmt(totalCharges)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border-input)] pt-1 font-bold">
                  <span>Net after charges</span>
                  <span className="text-[var(--bg-success)]">{fmt(netAfterCharges)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sales rows */}
      <div className="rounded-2xl bg-[var(--bg-card)] p-4 space-y-3">
        <p className="text-sm font-medium">Customer Sales</p>

        {sales.map((s, i) => (
          <div key={s.id} className="rounded-lg border border-[var(--border-input)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">#{i + 1}</span>
              {sales.length > 1 && (
                <button onClick={() => removeSale(s.id)} className="text-xs text-[var(--text-primary)]">Remove</button>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-[var(--text-muted)]">{t('customer')}</label>
                <CustomerPicker
                  customers={customers}
                  value={s.customerId}
                  onChange={(cid, cname) => {
                    setSales(sales.map((x) => x.id === s.id ? { ...x, customerId: cid, customerName: cname } : x));
                  }}
                  onAddNew={() => setShowAddCustomer(true)}
                  placeholder={t('selectCustomer')}
                />
              </div>
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
                <label className="text-xs text-[var(--text-muted)]">{t('customerName')} *</label>
                <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder={t('customerName')}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-[var(--text-muted)]">English</label>
                  <input type="text" value={newCustomerEnglishName} onChange={(e) => setNewCustomerEnglishName(e.target.value)}
                    placeholder="English"
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)]">తెలుగు</label>
                  <input type="text" value={newCustomerTeluguName} onChange={(e) => setNewCustomerTeluguName(e.target.value)}
                    placeholder="తెలుగు"
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)]">हिंदी</label>
                  <input type="text" value={newCustomerHindiName} onChange={(e) => setNewCustomerHindiName(e.target.value)}
                    placeholder="हिंदी"
                    className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t('phone')}</label>
                <input type="tel" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder={t('phone')}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">{t('creditLimit')}</label>
                <input type="number" value={newCustomerCreditLimit} onChange={(e) => setNewCustomerCreditLimit(e.target.value)}
                  placeholder={t('creditLimit')}
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => {
                setShowAddCustomer(false);
                setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerCreditLimit('');
              }} className="flex-1 rounded-lg border border-[var(--border-input)] py-2 text-sm text-[var(--text-primary)]">
                {t('cancel')}
              </button>
              <button onClick={async () => {
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
                      creditLimit: newCustomerCreditLimit ? parseFloat(newCustomerCreditLimit) : null
                    })
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
                    // Auto-select the newly added customer in the first empty sale row
                    setSales(prev => prev.map((s, i) => i === 0 && !s.customerId ? { ...s, customerId: newC.id, customerName: newC.name } : s));
                    setShowAddCustomer(false);
                    setNewCustomerName(''); setNewCustomerEnglishName(''); setNewCustomerTeluguName(''); setNewCustomerHindiName(''); setNewCustomerPhone(''); setNewCustomerCreditLimit('');
                  }
                } catch (e) {
                  console.error('Failed to add customer:', e);
                }
              }} className="flex-1 rounded-lg bg-[var(--bg-primary)] py-2 text-sm font-medium text-[var(--text-on-primary)]">
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

        <button onClick={addSale}
          className="w-full rounded-lg border border-dashed border-[var(--border-input)] py-2 text-sm text-[var(--text-muted)]">
          + {t('addSaleEntry')}
        </button>

        {totalSalesAmount > 0 && (
          <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm">
            Total: <span className="font-bold">{totalBagsSold} bags · {totalWeightSold} kg · {fmt(totalSalesAmount)}</span>
          </div>
        )}
      </div>

      {saveError && !showUpload && (
        <div className="rounded-lg bg-[var(--bg-error)] p-3 text-sm text-[var(--text-on-primary)]">{saveError}</div>
      )}

      <button onClick={handleSave} disabled={!canSave || saving}
        className="w-full rounded-lg bg-[var(--bg-success)] py-3 text-sm font-bold text-[var(--text-on-primary)] disabled:opacity-50">
        {saving ? 'Saving...' : '✓ Save Sales'}
      </button>
    </div>
  );
}
