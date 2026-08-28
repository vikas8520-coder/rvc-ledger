'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function PaymentPage() {
  const { t } = useI18n();
  const [customers, setCustomers] = useState<string[]>([]);
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'credit'>('cash');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => {
        const list = data.names || [];
        setCustomers(list);
        if (list.length > 0) setCustomer(list[0]);
      });
  }, []);

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
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('recordPayment')}</h1>

      <form onSubmit={handleSubmit} className="max-w-md space-y-4 rounded-2xl bg-[var(--bg-card)] p-6">
        <div>
          <label className="text-sm text-[var(--text-muted)]">{t('customer')}</label>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
          >
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
          <label className="text-sm text-[var(--text-muted)]">{t('amountReceived')}</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
            required
          />
        </div>

        <div>
          <label className="text-sm text-[var(--text-muted)]">{t('paymentMethod')}</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'upi' | 'credit')}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
          >
            <option value="cash">{t('cash')}</option>
            <option value="upi">{t('upi')}</option>
            <option value="credit">{t('credit')}</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-[var(--text-muted)]">{t('notes')}</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notes')}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-2"
          />
        </div>

        <button
          type="submit"
          disabled={!customer || !date || !amount || status === 'saving'}
          className="w-full rounded-xl bg-[var(--bg-success)] p-3 font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
        >
          {status === 'saving' ? t('saving') : t('recordPayment')}
        </button>

        {status === 'done' && (
          <p className="text-center text-[var(--bg-success)]">{t('paymentRecorded')}</p>
        )}
        {status === 'error' && <p className="text-center text-[var(--bg-primary)]">{error}</p>}
      </form>
    </div>
  );
}
