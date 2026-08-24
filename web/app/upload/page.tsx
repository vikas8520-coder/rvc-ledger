'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { recognizeBill, OcrProgress } from '@/lib/ocr';
import { parseBillText, buildDisplay } from '@/lib/parser';
import { ParsedBill } from '@/lib/parser';
import { BillItem } from '@/lib/types';
import { classifyScript } from '@/lib/catalog';
import { distance } from 'fastest-levenshtein';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

interface EditableItem {
  raw: string;
  confirmed: string;
  qty: string;
  rate: string;
  amount: number;
}

export default function UploadPage() {
  const [step, setStep] = useState<'idle' | 'ocr' | 'review' | 'saving' | 'done'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [ocrText, setOcrText] = useState('');

  const [customerList, setCustomerList] = useState<string[]>([]);
  const [customerSelect, setCustomerSelect] = useState('__new__');
  const [customerInput, setCustomerInput] = useState('');
  const [customer, setCustomer] = useState('');
  const [newCustomerConfirmed, setNewCustomerConfirmed] = useState(false);

  const [date, setDate] = useState('');
  const [billNo, setBillNo] = useState('');
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualLine, setManualLine] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => {
        const list = data.names || [];
        setCustomerList(list);
        if (list.includes('SRS Hostels')) {
          setCustomerSelect('SRS Hostels');
          setCustomer('SRS Hostels');
        } else if (list.length > 0) {
          setCustomerSelect(list[0]);
          setCustomer(list[0]);
        } else {
          setCustomerSelect('__new__');
        }
      })
      .catch(() => {
        setCustomerSelect('__new__');
      });
  }, []);

  const fuzzy = useMemo(() => {
    const name = customer.trim().toLowerCase();
    if (!name || customerList.some((c) => c.toLowerCase() === name)) return null;
    let best: { name: string; dist: number } | null = null;
    for (const c of customerList) {
      const d = distance(name, c.toLowerCase());
      if (!best || d < best.dist) best = { name: c, dist: d };
    }
    if (!best) return null;
    const threshold = name.length <= 4 ? 1 : Math.max(1, Math.floor(name.length * 0.3));
    if (best.dist <= threshold) return best;
    return null;
  }, [customer, customerList]);

  const isExistingCustomer = customerList.some(
    (c) => c.toLowerCase() === customer.trim().toLowerCase()
  );

  const canSave =
    !!customer.trim() &&
    !!date &&
    (isExistingCustomer || newCustomerConfirmed);

  const handleCustomerSelect = (value: string) => {
    setCustomerSelect(value);
    setNewCustomerConfirmed(false);
    if (value === '__new__') {
      setCustomer(customerInput.trim());
    } else {
      setCustomer(value);
      setCustomerInput(value);
    }
  };

  const handleCustomerInput = (value: string) => {
    setCustomerInput(value);
    setCustomer(value.trim());
    setNewCustomerConfirmed(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStep('ocr');
    setProgress(null);
    setSaveError('');
    try {
      const text = await recognizeBill(f, setProgress);
      setOcrText(text);
      const parsed = parseBillText(text);

      setDate(parsed.date || '');
      setBillNo(parsed.billNo || '');
      setTotal(parsed.total);

      const editable = parsed.items.map((it) => ({
        raw: it.raw_text,
        confirmed: it.confirmed_name,
        qty: it.qty || '',
        rate: it.rate || '',
        amount: it.amount,
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
      }));

      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customer,
          date,
          billNo,
          total,
          items: billItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStep('done');
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
      setStep('review');
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f0e6] p-6 text-[#3a2f2f]">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload bill</h1>
        <a href="/" className="text-[#8b2e2e]">← Dashboard</a>
      </header>

      {step === 'idle' && (
        <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-[#c9c0b2] bg-[#e8e0d2] p-10 text-center">
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <p className="text-lg font-medium">Tap to choose a bill photo</p>
          <p className="text-sm text-[#8a7a6a]">PNG or JPG</p>
        </label>
      )}

      {step === 'ocr' && (
        <div className="rounded-2xl bg-[#e8e0d2] p-6 text-center">
          <p className="mb-2 font-medium">Reading the bill with tesseract.js…</p>
          {progress && (
            <div>
              <p className="text-sm text-[#7a6a5a]">{progress.status}</p>
              <div className="mt-2 h-2 w-full rounded bg-[#d9d0c2]">
                <div
                  className="h-2 rounded bg-[#8b2e2e]"
                  style={{ width: `${Math.max(5, progress.progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-[#e8e0d2] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm text-[#7a6a5a]">Customer</label>
                <select
                  value={customerSelect}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
                >
                  {customerList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__new__">+ New customer</option>
                </select>
                {customerSelect === '__new__' && (
                  <input
                    value={customerInput}
                    onChange={(e) => handleCustomerInput(e.target.value)}
                    placeholder="Type customer name"
                    className="mt-2 w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
                  />
                )}

                {isExistingCustomer && (
                  <p className="mt-1 text-xs text-[#2d6b4f]">Existing customer — will add to this account.</p>
                )}

                {!isExistingCustomer && customer.trim() && fuzzy && (
                  <div className="mt-2 rounded-lg bg-[#fff9e6] p-2 text-sm">
                    <p className="text-[#8a7a6a]">
                      Did you mean <strong>{fuzzy.name}</strong>?
                    </p>
                    <div className="mt-1 flex gap-2">
                      <button
                        onClick={() => handleCustomerSelect(fuzzy.name)}
                        className="rounded bg-[#2d6b4f] px-2 py-1 text-xs text-white"
                      >
                        Yes, use {fuzzy.name}
                      </button>
                      <button
                        onClick={() => setNewCustomerConfirmed(true)}
                        className="rounded bg-[#8b2e2e] px-2 py-1 text-xs text-white"
                      >
                        No, create new
                      </button>
                    </div>
                  </div>
                )}

                {!isExistingCustomer && customer.trim() && !fuzzy && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#fff9e6] p-2 text-sm">
                    <input
                      id="newCustomer"
                      type="checkbox"
                      checked={newCustomerConfirmed}
                      onChange={(e) => setNewCustomerConfirmed(e.target.checked)}
                    />
                    <label htmlFor="newCustomer" className="text-[#8a7a6a]">
                      This is a new customer. Save as <strong>{customer}</strong>.
                    </label>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-[#7a6a5a]">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
                />
              </div>
              <div>
                <label className="text-sm text-[#7a6a5a]">Bill No.</label>
                <input
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  className="w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
                />
              </div>
            </div>
            <div className="mt-3 text-right">
              <p className="text-2xl font-bold">Total: {fmt(total)}</p>
            </div>
          </section>

          <section className="rounded-2xl bg-[#e8e0d2] p-4">
            <h2 className="mb-3 font-semibold">Items</h2>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid gap-2 rounded-xl bg-[#f5f0e6] p-3 sm:grid-cols-12">
                  <input
                    value={it.raw}
                    onChange={(e) => updateItem(idx, 'raw', e.target.value)}
                    className="col-span-3 rounded border border-[#d9d0c2] bg-white p-2 text-sm"
                    placeholder="Raw name"
                  />
                  <input
                    value={it.confirmed}
                    onChange={(e) => updateItem(idx, 'confirmed', e.target.value)}
                    className="col-span-4 rounded border border-[#d9d0c2] bg-white p-2 text-sm"
                    placeholder="Confirmed name"
                  />
                  <input
                    value={it.qty}
                    onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                    className="col-span-2 rounded border border-[#d9d0c2] bg-white p-2 text-sm"
                    placeholder="qty"
                  />
                  <input
                    value={it.rate}
                    onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                    className="col-span-1 rounded border border-[#d9d0c2] bg-white p-2 text-sm"
                    placeholder="rate"
                  />
                  <input
                    type="number"
                    value={it.amount}
                    onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                    className="col-span-1 rounded border border-[#d9d0c2] bg-white p-2 text-sm"
                    placeholder="amt"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="col-span-1 rounded bg-[#8b2e2e] text-sm text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-[#f5f0e6] p-3">
              <p className="mb-2 text-sm text-[#7a6a5a]">Add a manual item (e.g. &quot;Bendi 10 kg 40 400&quot;)</p>
              <div className="grid gap-2 sm:grid-cols-12">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="col-span-4 rounded border border-[#d9d0c2] bg-white p-2 text-sm"
                  placeholder="Item name"
                />
                <input
                  value={manualLine}
                  onChange={(e) => setManualLine(e.target.value)}
                  className="col-span-6 rounded border border-[#d9d0c2] bg-white p-2 text-sm"
                  placeholder="qty rate amount"
                />
                <button
                  onClick={addUnparsed}
                  className="col-span-2 rounded bg-[#2d6b4f] text-sm text-white"
                >
                  Add
                </button>
              </div>
            </div>
          </section>

          {unparsed.length > 0 && (
            <section className="rounded-2xl bg-[#e8e0d2] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[#8a7a6a]">OCR could not read these lines</h2>
              <ul className="text-sm text-[#7a6a5a]">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full rounded-xl bg-[#8b2e2e] p-4 font-semibold text-white disabled:opacity-50"
          >
            Save bill
          </button>
          {saveError && <p className="text-center text-[#8b2e2e]">{saveError}</p>}
        </div>
      )}

      {step === 'saving' && (
        <div className="rounded-2xl bg-[#e8e0d2] p-6 text-center">
          <p className="font-medium">Saving…</p>
        </div>
      )}

      {step === 'done' && (
        <div className="rounded-2xl bg-[#e8e0d2] p-6 text-center">
          <p className="text-xl font-bold">Saved!</p>
          <a href="/" className="mt-4 inline-block rounded bg-[#8b2e2e] px-4 py-2 text-white">View dashboard</a>
        </div>
      )}
    </main>
  );
}
