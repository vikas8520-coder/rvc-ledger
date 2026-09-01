'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import CustomerPicker, { CustomerOption } from '../components/CustomerPicker';
import Autocomplete from '../components/Autocomplete';
import { usePersistentState } from '../components/usePersistentState';
import { generateBillsPdf, generateCreditLedgerPdf, generateOutstandingListPdf, printPdfBlob } from '@/lib/pdfShare';
import { BillPrintData, CreditLedgerEntry, ShopProfile } from '@/lib/billPrint';
import { PrinterIcon } from '../components/Icons';
import { Customer } from '@/lib/types';

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
  isCash?: boolean; // cash sale (immediately settled) or credit
}

let idCounter = 0;
function newId() { return `line-${Date.now()}-${idCounter++}`; }

export default function SellPage() {
  const { t, lang } = useI18n();
  const uiLang = getUiLang(lang);
  const [date, setDate] = usePersistentState('sell-date', today());
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [farmers, setFarmers] = useState<string[]>([]);

  // Entry form state
  const [item, setItem] = useState('');
  const [farmer, setFarmer] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [bags, setBags] = useState('');
  const [weightPerBag, setWeightPerBag] = useState('');
  const [kgs, setKgs] = useState('');
  const [rate, setRate] = useState('');
  const [hamaliEnabled, setHamaliEnabled] = useState(false);
  const [hamali, setHamali] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('credit');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Day grid state
  const [dayLines, setDayLines] = useState<SaleLine[]>([]);

  // Ledger dropdown
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState<'idle' | 'generating' | 'sharing'>('idle');
  const [shopSettings, setShopSettings] = useState<ShopProfile>({});

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
        // Don't auto-select — always ask the user to pick a customer
      })
      .catch(() => {});
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => {
        const items = (d.items || []).map((i: any) => i.name).filter(Boolean);
        setCatalog(items);
      })
      .catch(() => {});
    fetch('/api/farmers')
      .then((r) => r.json())
      .then((d) => {
        const names = (d.farmers || []).map((f: any) => f.farmer).filter(Boolean);
        setFarmers(names);
      })
      .catch(() => {});
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setShopSettings(d.settings || {}))
      .catch(() => {});
  }, []);

  // Close ledger dropdown when clicking outside
  useEffect(() => {
    if (!showLedgerMenu) return;
    const handler = () => setShowLedgerMenu(false);
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [showLedgerMenu]);

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
          isCash: l.isCash || false,
        })));
      })
      .catch(() => {});
  }, [date]);

  // Auto-calculate total kgs from bags × weight per bag
  const autoKgs = (() => {
    const b = num(bags);
    const w = num(weightPerBag);
    return b > 0 && w > 0 ? Math.round(b * w * 100) / 100 : 0;
  })();

  // Effective kgs: auto-calculated if weightPerBag is set, otherwise manual
  const effectiveKgs = autoKgs > 0 ? autoKgs : num(kgs);

  // Auto-calculate amount
  const computedAmount = (() => {
    const r = num(rate);
    const base = effectiveKgs > 0 ? effectiveKgs * r : num(bags) * r;
    const h = hamaliEnabled ? num(hamali) : 0;
    return Math.round(base + h);
  })();

  const canSave = item.trim() && (customerId || customerName.trim()) && (num(bags) > 0 || num(kgs) > 0 || autoKgs > 0) && num(rate) > 0;

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const items = [{
        raw_text: item.trim(),
        confirmed_name: item.trim(),
        qty: effectiveKgs > 0 ? String(effectiveKgs) : null,
        rate: rate,
        amount: computedAmount,
        display: `${bags || 0} bags${effectiveKgs > 0 ? `, ${effectiveKgs} kg` : ''} @ ₹${rate}`,
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
          paymentType,
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
        kgs: effectiveKgs > 0 ? String(effectiveKgs) : kgs,
        rate,
        hamaliEnabled,
        hamali: hamaliEnabled ? hamali : '',
        amount: computedAmount,
        saved: true,
        isCash: paymentType === 'cash',
      }]);

      // Reset form for next entry
      setBags(''); setWeightPerBag(''); setKgs(''); setRate(''); setHamali(''); setHamaliEnabled(false);
      setPaymentType('credit');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (line: SaleLine) => {
    // Load line data into the form for editing
    setItem(line.item);
    setFarmer(line.farmer);
    setCustomerId(line.customerId);
    setCustomerName(line.customerName);
    setBags(line.bags);
    setWeightPerBag(''); // not stored separately, reset on edit
    setKgs(line.kgs);
    setRate(line.rate);
    setHamaliEnabled(line.hamaliEnabled);
    setHamali(line.hamali);
    setPaymentType(line.isCash ? 'cash' : 'credit');
    setEditingId(line.txnId || line.id);
    setSaveError('');
    setSaveSuccess(false);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setSaveError('');
    try {
      // Delete old transaction
      const delRes = await fetch(`/api/transactions/${editingId}`, { method: 'DELETE' });
      if (!delRes.ok) {
        const d = await delRes.json();
        throw new Error(d.error || 'Failed to delete old entry');
      }

      // Save new transaction
      const items = [{
        raw_text: item.trim(),
        confirmed_name: item.trim(),
        qty: effectiveKgs > 0 ? String(effectiveKgs) : null,
        rate: rate,
        amount: computedAmount,
        display: `${bags || 0} bags${effectiveKgs > 0 ? `, ${effectiveKgs} kg` : ''} @ ₹${rate}`,
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
          paymentType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      // Update day grid: replace the edited line
      const selectedCustomer = customers.find((c) => c.id === customerId);
      setDayLines(prev => prev.map(l => {
        if ((l.txnId || l.id) === editingId) {
          return {
            ...l,
            item: item.trim(),
            farmer: farmer.trim(),
            customerId,
            customerName: customerName.trim(),
            englishName: selectedCustomer?.englishName || null,
            teluguName: selectedCustomer?.teluguName || null,
            hindiName: selectedCustomer?.hindiName || null,
            bags,
            kgs: effectiveKgs > 0 ? String(effectiveKgs) : kgs,
            rate,
            hamaliEnabled,
            hamali: hamaliEnabled ? hamali : '',
            amount: computedAmount,
            saved: true,
            isCash: paymentType === 'cash',
          };
        }
        return l;
      }));

      // Reset form
      setItem(''); setFarmer(''); setCustomerId(null); setCustomerName('');
      setBags(''); setWeightPerBag(''); setKgs(''); setRate(''); setHamali(''); setHamaliEnabled(false);
      setPaymentType('credit');
      setEditingId(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setSaveError(err.message || 'Edit failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setItem(''); setFarmer(''); setCustomerId(null); setCustomerName('');
    setBags(''); setWeightPerBag(''); setKgs(''); setRate(''); setHamali(''); setHamaliEnabled(false);
    setPaymentType('credit');
    setEditingId(null);
    setSaveError('');
  };

  const handleDelete = async (line: SaleLine) => {
    const txnId = line.txnId || line.id;
    if (!confirm(`Delete this entry?\n${line.item} — ${line.customerName} — ₹${line.amount}`)) return;
    try {
      const res = await fetch(`/api/transactions/${txnId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Delete failed');
      }
      // Remove from day grid
      setDayLines(prev => prev.filter(l => (l.txnId || l.id) !== txnId));
      // If editing this line, cancel edit
      if (editingId === txnId) handleCancelEdit();
    } catch (err: any) {
      setSaveError(err.message || 'Delete failed');
    }
  };

  // Totals
  const totalBags = dayLines.reduce((s, l) => s + num(l.bags), 0);
  const totalKgs = dayLines.reduce((s, l) => s + num(l.kgs), 0);
  const totalAmount = dayLines.reduce((s, l) => s + l.amount, 0);
  const totalHamali = dayLines.reduce((s, l) => s + (l.hamaliEnabled ? num(l.hamali) : 0), 0);
  const cashTotal = dayLines.filter((l) => l.isCash).reduce((s, l) => s + l.amount, 0);
  const creditTotal = dayLines.filter((l) => !l.isCash).reduce((s, l) => s + l.amount, 0);

  // Build BillPrintData from dayLines (group by txnId)
  const dayLinesToBills = (): BillPrintData[] => {
    const byTxn = new Map<string, SaleLine[]>();
    for (const l of dayLines) {
      const key = l.txnId || l.id;
      const arr = byTxn.get(key) || [];
      arr.push(l);
      byTxn.set(key, arr);
    }
    const bills: BillPrintData[] = [];
    for (const [, lines] of byTxn) {
      const first = lines[0];
      const displayName = formatCustomerName({
        name: first.customerName,
        englishName: first.englishName,
        teluguName: first.teluguName,
        hindiName: first.hindiName,
      }, uiLang);
      bills.push({
        customerName: displayName,
        date: date,
        billNo: null,
        items: lines.map((l) => ({
          name: l.item,
          qty: l.kgs || null,
          rate: l.rate || null,
          amount: l.amount,
          display: `${l.bags || 0} bags${l.kgs ? `, ${l.kgs} kg` : ''} @ ₹${l.rate}`,
          kind: 'item' as const,
          chargeCode: null,
          bags: l.bags || null,
        })),
        total: lines.reduce((s, l) => s + l.amount, 0),
      });
    }
    return bills;
  };

  // Build credit entries from today's credit sales (exclude CASH SALES)
  const dayCreditEntries = (): CreditLedgerEntry[] => {
    const byCustomer = new Map<string, { name: string; englishName?: string | null; teluguName?: string | null; hindiName?: string | null; phone?: string | null; amount: number }>();
    for (const l of dayLines) {
      if (l.customerName === 'CASH SALES') continue;
      const key = l.customerId || l.customerName;
      const existing = byCustomer.get(key);
      if (existing) {
        existing.amount += l.amount;
      } else {
        byCustomer.set(key, {
          name: l.customerName,
          englishName: l.englishName,
          teluguName: l.teluguName,
          hindiName: l.hindiName,
          phone: customers.find((c) => c.id === l.customerId)?.phone || null,
          amount: l.amount,
        });
      }
    }
    return Array.from(byCustomer.entries())
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, data], i) => ({
        code: String(i + 1),
        name: formatCustomerName({
          name: data.name,
          englishName: data.englishName,
          teluguName: data.teluguName,
          hindiName: data.hindiName,
        }, uiLang),
        phone: data.phone || undefined,
        amount: Math.round(data.amount),
        isCredit: false,
      }));
  };

  // Build Customer-like objects from today's sales for Dues Summary
  const dayDueCustomers = (): Customer[] => {
    const byCustomer = new Map<string, { name: string; englishName?: string | null; teluguName?: string | null; hindiName?: string | null; phone?: string | null; billed: number }>();
    for (const l of dayLines) {
      if (l.customerName === 'CASH SALES') continue;
      const key = l.customerId || l.customerName;
      const existing = byCustomer.get(key);
      if (existing) {
        existing.billed += l.amount;
      } else {
        byCustomer.set(key, {
          name: l.customerName,
          englishName: l.englishName,
          teluguName: l.teluguName,
          hindiName: l.hindiName,
          phone: customers.find((c) => c.id === l.customerId)?.phone || null,
          billed: l.amount,
        });
      }
    }
    return Array.from(byCustomer.values()).map((data) => ({
      id: '',
      name: data.name,
      englishName: data.englishName,
      teluguName: data.teluguName,
      hindiName: data.hindiName,
      phone: data.phone,
      billed: data.billed,
      paid: 0,
      due: data.billed,
      txns: [],
    }));
  };

  const generateDayPdf = (format: 'creditLedger' | 'outstanding' | 'patti'): { blob: Blob; filename: string } => {
    const dateStr = new Date(date + 'T00:00:00').toLocaleDateString('en-IN').replace(/\//g, '-');
    if (format === 'creditLedger') {
      const entries = dayCreditEntries();
      if (entries.length === 0) throw new Error('No credit sales today');
      return {
        blob: generateCreditLedgerPdf(entries, shopSettings, dateStr, `Mandi Ledger ${date}`),
        filename: `mandi-ledger-${dateStr}.pdf`,
      };
    } else if (format === 'outstanding') {
      const dueCustomers = dayDueCustomers();
      if (dueCustomers.length === 0) throw new Error('No credit sales today');
      return {
        blob: generateOutstandingListPdf(dueCustomers, shopSettings, uiLang),
        filename: `dues-summary-${dateStr}.pdf`,
      };
    } else {
      const bills = dayLinesToBills();
      if (bills.length === 0) throw new Error('No sales today');
      return {
        blob: generateBillsPdf(bills, shopSettings, 'patti'),
        filename: `compact-bills-${dateStr}.pdf`,
      };
    }
  };

  const printDayPdf = (format: 'creditLedger' | 'outstanding' | 'patti') => {
    setShowLedgerMenu(false);
    try {
      const { blob } = generateDayPdf(format);
      printPdfBlob(blob);
    } catch (err: any) {
      alert(err.message || 'Failed to generate PDF');
    }
  };

  const shareDayPdf = async (format: 'creditLedger' | 'outstanding' | 'patti') => {
    setShowLedgerMenu(false);
    setLedgerStatus('generating');
    try {
      const { blob, filename } = generateDayPdf(format);
      const shareText = `${shopSettings.shopName || 'RVC'} — Sales ${date}`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      const isMac = /Mac/i.test(navigator.userAgent) && !/Mobile|iPhone|iPad/i.test(navigator.userAgent);
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

      if (canShareFiles && !isMac) {
        setLedgerStatus('sharing');
        navigator.share({ files: [file], title: filename, text: shareText })
          .then(() => setLedgerStatus('idle'))
          .catch(() => setLedgerStatus('idle'));
        return;
      }

      // macOS desktop: upload PDF, open WhatsApp Web with link
      setLedgerStatus('sharing');
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('title', shareText);
      const res = await fetch('/api/pdf', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to upload PDF');
      const { id } = await res.json();
      const pdfLink = `${window.location.origin}/pdf/${id}`;
      const waText = `${shareText}\n\nView PDF: ${pdfLink}`;
      window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');

      // Download as backup
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setLedgerStatus('idle');
    } catch (err: any) {
      alert(err.message || 'Failed to share PDF');
      setLedgerStatus('idle');
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('sell')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative">
            <button
              type="button"
              onClick={() => setShowLedgerMenu((v) => !v)}
              disabled={dayLines.length === 0 || ledgerStatus !== 'idle'}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-primary)] px-3 py-1.5 text-sm font-medium text-[var(--text-on-primary)] disabled:opacity-40"
            >
              <PrinterIcon size={14} />
              {ledgerStatus === 'generating' ? 'Generating…' : ledgerStatus === 'sharing' ? 'Sharing…' : 'Print / Share'}
              <span className="text-xs">▾</span>
            </button>
            {showLedgerMenu && (
              <span className="absolute right-0 top-9 z-20 w-64 rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                <div className="px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Mandi Ledger</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Credit sales — {date}</p>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => printDayPdf('creditLedger')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">🖨 Print</button>
                    <button onClick={() => shareDayPdf('creditLedger')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">📤 Share</button>
                  </div>
                </div>
                <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Dues Summary</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Credit customers — {date}</p>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => printDayPdf('outstanding')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">🖨 Print</button>
                    <button onClick={() => shareDayPdf('outstanding')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">📤 Share</button>
                  </div>
                </div>
                <div className="border-t border-[var(--border-light)] px-2 py-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Patti (6 per page)</p>
                  <p className="text-[10px] text-[var(--text-muted)]">All bills — {date}</p>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => printDayPdf('patti')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">🖨 Print</button>
                    <button onClick={() => shareDayPdf('patti')} className="flex-1 rounded-md bg-[var(--bg-card)] px-2 py-1 text-[11px] hover:bg-[var(--bg-card-hover)]">📤 Share</button>
                  </div>
                </div>
              </span>
            )}
          </span>
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
            <Autocomplete
              options={catalog}
              value={item}
              onChange={setItem}
              placeholder="e.g. W.MIRCHI, BEANS"
            />
          </div>

          {/* Farmer */}
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('farmer')}</label>
            <Autocomplete
              options={farmers}
              value={farmer}
              onChange={setFarmer}
              placeholder="e.g. SK 170"
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

        {/* Payment type toggle */}
        <div>
          <label className="text-xs text-[var(--text-muted)]">Payment Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaymentType('credit')}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                paymentType === 'credit'
                  ? 'border-[var(--bg-primary)] bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                  : 'border-[var(--border-input)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              Credit
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('cash')}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                paymentType === 'cash'
                  ? 'border-[var(--bg-success)] bg-[var(--bg-success)] text-[var(--text-on-primary)]'
                  : 'border-[var(--border-input)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              Cash
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
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
            <label className="text-xs text-[var(--text-muted)]">Wt/Bag (kg)</label>
            <input
              type="number"
              value={weightPerBag}
              onChange={(e) => setWeightPerBag(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('kgs')}</label>
            <input
              type="number"
              value={autoKgs > 0 ? autoKgs : kgs}
              onChange={(e) => {
                setWeightPerBag('');
                setKgs(e.target.value);
              }}
              placeholder="0"
              inputMode="decimal"
              className={`w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2 text-sm ${autoKgs > 0 ? 'bg-[var(--bg-secondary)] font-medium' : ''}`}
            />
            {autoKgs > 0 && (
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{bags} × {weightPerBag} = {autoKgs} kg</p>
            )}
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

        {editingId ? (
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={!canSave || saving}
              className="flex-1 rounded-lg bg-[var(--bg-primary)] py-2.5 text-sm font-medium text-[var(--text-on-primary)] disabled:opacity-40"
            >
              {saving ? t('saving') : 'Update Entry'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              className="rounded-lg bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full rounded-lg bg-[var(--bg-primary)] py-2.5 text-sm font-medium text-[var(--text-on-primary)] disabled:opacity-40"
          >
            {saving ? t('saving') : t('saveLine')}
          </button>
        )}
      </section>

      {/* Edit mode indicator */}
      {editingId && (
        <div className="rounded-lg bg-[var(--bg-warning)] bg-opacity-20 px-4 py-2 text-sm text-[var(--text-primary)]">
          ✎ Editing an existing entry. Click <span className="font-semibold">Update Entry</span> to save changes, or <span className="font-semibold">Cancel</span> to discard.
        </div>
      )}

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
                  <th className="py-1.5 pr-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dayLines.map((l, i) => {
                  const isCash = l.isCash;
                  const displayName = formatCustomerName({
                    name: l.customerName,
                    englishName: l.englishName,
                    teluguName: l.teluguName,
                    hindiName: l.hindiName,
                  }, uiLang);
                  const isEditing = editingId === (l.txnId || l.id);
                  return (
                    <tr key={l.id} className={`border-l-4 ${isEditing ? 'border-l-[var(--bg-warning)]' : isCash ? 'border-l-[var(--bg-success)]' : 'border-l-[var(--bg-primary)]'} border-b border-[var(--border-light)] ${isEditing ? 'bg-[var(--bg-warning)] bg-opacity-10' : ''}`}>
                      <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)]">{i + 1}</td>
                      <td className="py-1.5 pr-2 font-medium">{l.item}</td>
                      <td className="py-1.5 pr-2">
                        {displayName}
                        <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-medium ${isCash ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'}`}>
                          {isCash ? 'Cash' : 'Credit'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right">{l.bags || '—'}</td>
                      <td className="py-1.5 pr-2 text-right">{l.kgs || '—'}</td>
                      <td className="py-1.5 pr-2 text-right">{l.rate}</td>
                      <td className="py-1.5 pr-2 text-right">{l.hamaliEnabled ? l.hamali : '—'}</td>
                      <td className="py-1.5 pr-2 text-right font-medium">{fmt(l.amount)}</td>
                      <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)]">{l.farmer || '—'}</td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(l)}
                            disabled={editingId !== null}
                            className="rounded px-2 py-0.5 text-xs text-[var(--bg-primary)] hover:bg-[var(--bg-base)] disabled:opacity-30"
                            title="Edit this entry"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleDelete(l)}
                            disabled={editingId !== null}
                            className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-30"
                            title="Delete this entry"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer totals */}
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border-light)] pt-3 sm:gap-3">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
