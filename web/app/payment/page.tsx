'use client';

import { useEffect, useState } from 'react';
import LanguageSwitcher from '../components/LanguageSwitcher';
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
        body: JSON.stringify({ customerName: customer, date, amount: Number(amount), notes }),
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
    <main className="min-h-screen bg-[#f5f0e6] p-6 text-[#3a2f2f]">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('recordPayment')}</h1>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <a href="/" className="text-[#8b2e2e]">{t('backToDashboard')}</a>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-md space-y-4 rounded-2xl bg-[#e8e0d2] p-6">
        <div>
          <label className="text-sm text-[#7a6a5a]">{t('customer')}</label>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
          >
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-[#7a6a5a]">{t('date')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
          />
        </div>

        <div>
          <label className="text-sm text-[#7a6a5a]">{t('amountReceived')}</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
            required
          />
        </div>

        <div>
          <label className="text-sm text-[#7a6a5a]">{t('notes')}</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cash / UPI"
            className="w-full rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-2"
          />
        </div>

        <button
          type="submit"
          disabled={!customer || !date || !amount || status === 'saving'}
          className="w-full rounded-xl bg-[#2d6b4f] p-3 font-semibold text-white disabled:opacity-50"
        >
          {status === 'saving' ? t('saving') : t('recordPayment')}
        </button>

        {status === 'done' && (
          <p className="text-center text-[#2d6b4f]">{t('paymentRecorded')}</p>
        )}
        {status === 'error' && <p className="text-center text-[#8b2e2e]">{error}</p>}
      </form>
    </main>
  );
}
