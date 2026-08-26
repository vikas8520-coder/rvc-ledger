'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { fmt, fmtDate } from '@/lib/format';
import { ExpenseEntry } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORIES = ['catRent', 'catElectricity', 'catLabour', 'catTransport', 'catWater', 'catOther'];

export default function ExpensesPage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('catRent');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');

  const load = () => {
    fetch('/api/expenses')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!amount.trim()) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          category: t(category as any),
          description: description.trim(),
          amount: Number(amount),
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setDescription('');
      setAmount('');
      setOpen(false);
      setStatus('idle');
      load();
    } catch {
      setStatus('idle');
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    load();
  };

  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('navExpenses')}</h1>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md bg-[#8b2e2e] px-3 py-1.5 text-sm text-white"
        >
          {open ? t('close') : t('addExpense')}
        </button>
      </div>

      <p className="text-xs text-[#8a7a6a]">{t('expenseHelp')}</p>

      {open && (
        <section className="space-y-3 rounded-lg bg-[#e8e0d2] p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <label className="text-xs text-[#7a6a5a]">{t('date')}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[#7a6a5a]">{t('expenseCategory')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(c as any)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#7a6a5a]">{t('expenseDescription')}</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[#7a6a5a]">{t('expenseAmount')}</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={status === 'saving' || !amount.trim()}
            className="w-full rounded-md bg-[#2d6b4f] py-2 font-semibold text-white disabled:opacity-50"
          >
            {status === 'saving' ? t('saving') : t('addExpense')}
          </button>
        </section>
      )}

      {loading && <p className="text-sm text-[#8a7a6a]">{t('loading')}</p>}
      {!loading && entries.length === 0 && (
        <p className="rounded-lg bg-[#e8e0d2] p-4 text-center text-sm text-[#8a7a6a]">{t('noExpenses')}</p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          <div className="text-right text-sm font-semibold text-[#8b2e2e]">
            {t('totalExpenses')}: {fmt(totalAmount)}
          </div>
          {entries.map((e) => (
            <div key={e.id} className="rounded-lg bg-[#e8e0d2] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-[#7a6a5a]">{fmtDate(e.date)}</p>
                  <p className="text-sm font-medium">{e.category}</p>
                  {e.description && <p className="text-[11px] text-[#7a6a5a]">{e.description}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[#8b2e2e]">{fmt(e.amount)}</p>
                </div>
              </div>
              <div className="mt-1 text-right">
                <button onClick={() => remove(e.id)} className="text-[11px] text-[#8b2e2e] hover:underline">
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
