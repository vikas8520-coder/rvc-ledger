'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { Card, SectionHeader, Button, PageHeader } from '../components/ui';
import { CameraIcon, CheckIcon, AlertIcon, GraduationIcon } from '../components/Icons';
import { recognizeBill, OcrProgress } from '@/lib/ocr';
import { parseDate } from '@/lib/parser';
import { distance } from 'fastest-levenshtein';

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extract payment amount from OCR text.
 * Looks for lines with "received", "paid", "payment", "amount", or just the largest number.
 */
function extractPaymentAmount(text: string): { amount: number | null; date: string | null; customerHint: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let amount: number | null = null;
  let date: string | null = null;
  let customerHint: string | null = null;

  for (const line of lines) {
    // Check for date
    if (!date) {
      const d = parseDate(line);
      if (d) date = d;
    }

    // Check for amount keywords
    const lower = line.toLowerCase();
    if (/\b(received|paid|payment|amount|amt|cash|upi|rs|₹)\b/.test(lower)) {
      const nums = line.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/g);
      if (nums) {
        const val = Number(nums[nums.length - 1].replace(/,/g, ''));
        if (Number.isFinite(val) && val > 0) {
          amount = val;
        }
      }
    }
  }

  // If no keyword match, find the largest number in the text (likely the payment amount)
  if (!amount) {
    const allNums = text.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/g);
    if (allNums) {
      const vals = allNums.map((n) => Number(n.replace(/,/g, ''))).filter((n) => n > 0 && Number.isFinite(n));
      if (vals.length > 0) {
        amount = Math.max(...vals);
      }
    }
  }

  // Try to find a customer name — usually the first non-numeric, non-keyword line
  for (const line of lines) {
    if (/\d/.test(line)) continue;
    if (/\b(received|paid|payment|amount|date|rs|₹)\b/i.test(line)) continue;
    if (line.length < 3 || line.length > 40) continue;
    customerHint = line;
    break;
  }

  return { amount, date, customerHint };
}

/**
 * Check if OCR text is mostly garbage (unreadable handwriting).
 * Returns true if the text is too short or too garbled to be useful.
 */
function isOcrGarbage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // Very short output — probably nothing recognized
  if (trimmed.length < 10) return true;
  // Count readable words (Latin letters, at least 2 chars)
  const words = trimmed.split(/\s+/).filter((w) => /^[a-zA-Z]{2,}/.test(w));
  // If less than 2 readable words and no numbers, it's garbage
  const hasNumbers = /\d{2,}/.test(trimmed);
  if (words.length < 2 && !hasNumbers) return true;
  return false;
}

export default function PaymentPage() {
  const { t, ocrLangs } = useI18n();
  const [customers, setCustomers] = useState<string[]>([]);
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'credit'>('cash');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  // OCR state: 'idle' | 'scanning' | 'done' | 'failed'
  const [ocrStep, setOcrStep] = useState<'idle' | 'scanning' | 'done' | 'failed'>('idle');
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [ocrRawText, setOcrRawText] = useState<string>('');
  const [showRawOcr, setShowRawOcr] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => {
        const list = data.names || [];
        setCustomers(list);
        if (list.length > 0) setCustomer(list[0]);
      });
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setOcrStep('scanning');
    setOcrProgress(null);
    setError('');
    setOcrHint(null);
    setOcrRawText('');
    setShowRawOcr(false);
    try {
      const text = await recognizeBill(f, ocrLangs, setOcrProgress);
      setOcrRawText(text);

      // Check if OCR produced garbage
      if (isOcrGarbage(text)) {
        setOcrStep('failed');
        setOcrHint(t('ocrFailedHandwriting'));
        return;
      }

      const { amount: extractedAmount, date: extractedDate, customerHint } = extractPaymentAmount(text);

      const foundParts: string[] = [];
      if (extractedAmount) {
        setAmount(String(extractedAmount));
        foundParts.push(`₹${extractedAmount}`);
      }
      if (extractedDate) {
        setDate(extractedDate);
        foundParts.push(extractedDate);
      }

      // Try to match customer hint
      if (customerHint && customers.length > 0) {
        const lower = customerHint.toLowerCase();
        let best: { name: string; dist: number } | null = null;
        for (const c of customers) {
          const d = distance(lower, c.toLowerCase());
          if (!best || d < best.dist) best = { name: c, dist: d };
        }
        if (best && best.dist <= Math.max(2, Math.floor(customerHint.length * 0.3))) {
          setCustomer(best.name);
          foundParts.push(best.name);
        }
      }

      if (foundParts.length > 0) {
        setOcrHint(`${t('ocrFound')}: ${foundParts.join(' · ')}`);
        setOcrStep('done');
      } else {
        // OCR produced text but couldn't extract structured data
        setOcrStep('failed');
        setOcrHint(t('ocrCouldNotExtract'));
      }
    } catch (err: any) {
      setError(err.message || 'OCR failed');
      setOcrStep('failed');
      setOcrHint(t('ocrFailedError'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: customer, date, amount: Number(amount), notes, paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStatus('done');
      setAmount('');
      setNotes('');
      setOcrHint(null);
      setOcrStep('idle');
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('recordPayment')} />

      {/* Image upload for OCR */}
      <Card>
        <SectionHeader title={t('uploadPaymentRecord')} icon={<CameraIcon size={16} />} />
        <p className="mb-3 text-sm text-[var(--text-muted)]">{t('uploadPaymentHelp')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          className="hidden"
        />

        {/* Idle state — show upload button */}
        {ocrStep === 'idle' && (
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <span className="flex items-center gap-2"><CameraIcon size={16} /> {t('photographPayment')}</span>
          </Button>
        )}

        {/* Scanning state — show progress bar */}
        {ocrStep === 'scanning' && (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-card-hover)]">
              <div
                className="h-full bg-[var(--bg-primary)] transition-all"
                style={{ width: `${(ocrProgress?.progress || 0) * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {ocrProgress?.status || t('scanning')}... {ocrProgress ? Math.round(ocrProgress.progress * 100) : 0}%
            </p>
          </div>
        )}

        {/* Done state — OCR found something useful */}
        {ocrStep === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-success)] bg-opacity-10 p-3 text-sm text-[var(--bg-success)]">
              <CheckIcon size={16} /> {ocrHint}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                {t('scanAgain')}
              </Button>
              <button
                onClick={() => setShowRawOcr(!showRawOcr)}
                className="text-xs text-[var(--text-muted)] underline"
              >
                {showRawOcr ? t('hideRawOcr') : t('showRawOcr')}
              </button>
            </div>
            {showRawOcr && (
              <pre className="max-h-32 overflow-auto rounded-lg bg-[var(--bg-base)] p-3 text-xs whitespace-pre-wrap">
                {ocrRawText || '(empty)'}
              </pre>
            )}
          </div>
        )}

        {/* Failed state — OCR could not read the handwriting */}
        {ocrStep === 'failed' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--bg-primary)] bg-opacity-5 p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
              <div className="flex items-start gap-2">
                <AlertIcon size={18} className="mt-0.5 shrink-0 text-[var(--bg-primary)]" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--bg-primary)]">{ocrHint}</p>
                  <p className="text-xs text-[var(--text-muted)]">{t('ocrFailedHelp')}</p>
                </div>
              </div>
            </div>

            {/* Show raw OCR text so user can see what happened */}
            {ocrRawText.trim() && (
              <div>
                <button
                  onClick={() => setShowRawOcr(!showRawOcr)}
                  className="text-xs text-[var(--text-muted)] underline"
                >
                  {showRawOcr ? t('hideRawOcr') : t('showRawOcr')}
                </button>
                {showRawOcr && (
                  <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-[var(--bg-base)] p-3 text-xs whitespace-pre-wrap">
                    {ocrRawText}
                  </pre>
                )}
              </div>
            )}

            {/* Actions: try again, go to training, or fill manually */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <span className="flex items-center gap-1.5"><CameraIcon size={14} /> {t('scanAgain')}</span>
              </Button>
              <Link href="/training">
                <Button variant="outline" size="sm">
                  <span className="flex items-center gap-1.5"><GraduationIcon size={14} /> {t('goToTraining')}</span>
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setOcrStep('idle');
                  setOcrHint(null);
                  // Scroll to the form below
                  document.getElementById('payment-form')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {t('enterManually')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Payment form */}
      <Card>
        <form id="payment-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-[var(--text-muted)]">{t('customer')}</label>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-2.5 text-sm"
            >
              {customers.length === 0 && <option value="">{t('noCustomers')}</option>}
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[var(--text-muted)]">{t('date')}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)]">{t('amountReceived')}</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="₹0"
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-2.5 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-[var(--text-muted)]">{t('paymentMethod')}</label>
            <div className="flex gap-2">
              {(['cash', 'upi', 'credit'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 rounded-lg border p-2.5 text-sm font-medium transition-colors ${
                    paymentMethod === m
                      ? 'border-[var(--bg-primary)] bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                      : 'border-[var(--border-input)] bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  {t(m)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-[var(--text-muted)]">{t('notes')}</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notes')}
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] p-2.5 text-sm"
            />
          </div>

          <Button
            type="submit"
            variant="success"
            disabled={!customer || !date || !amount || status === 'saving'}
            className="w-full"
          >
            {status === 'saving' ? t('saving') : t('recordPayment')}
          </Button>

          {status === 'done' && (
            <p className="flex items-center justify-center gap-2 text-[var(--bg-success)]">
              <CheckIcon size={16} /> {t('paymentRecorded')}
            </p>
          )}
          {status === 'error' && <p className="text-center text-[var(--bg-primary)]">{error}</p>}
        </form>
      </Card>
    </div>
  );
}
