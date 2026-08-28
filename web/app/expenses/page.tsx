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
          className="rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]"
        >
          {open ? t('close') : t('addExpense')}
        </button>
      </div>

      <p className="text-xs text-[var(--text-faint)]">{t('expenseHelp')}</p>

      {open && (
        <section className="space-y-3 rounded-lg bg-[var(--bg-card)] p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('expenseCategory')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(c as any)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('expenseDescription')}</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('expenseAmount')}</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={status === 'saving' || !amount.trim()}
            className="w-full rounded-md bg-[var(--bg-success)] py-2 font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {status === 'saving' ? t('saving') : t('addExpense')}
          </button>
        </section>
      )}

      {loading && <p className="text-sm text-[var(--text-faint)]">{t('loading')}</p>}
      {!loading && entries.length === 0 && (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">{t('noExpenses')}</p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          <div className="text-right text-sm font-semibold text-[var(--bg-primary)]">
            {t('totalExpenses')}: {fmt(totalAmount)}
          </div>
          {entries.map((e) => (
            <div key={e.id} className="rounded-lg bg-[var(--bg-card)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-[var(--text-muted)]">{fmtDate(e.date)}</p>
                  <p className="text-sm font-medium">{e.category}</p>
                  {e.description && <p className="text-[11px] text-[var(--text-muted)]">{e.description}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[var(--bg-primary)]">{fmt(e.amount)}</p>
                </div>
              </div>
              <div className="mt-1 text-right">
                <button onClick={() => remove(e.id)} className="text-[11px] text-[var(--bg-primary)] hover:underline">
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
