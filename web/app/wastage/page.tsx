'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { fmt, fmtDate } from '@/lib/format';
import { WastageEntry } from '@/lib/types';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WastagePage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<WastageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(today());
  const [itemName, setItemName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [reason, setReason] = useState('');
  const [estCost, setEstCost] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');

  const load = () => {
    fetch('/api/wastage')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!itemName.trim()) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/wastage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          itemName: itemName.trim(),
          qty: qty.trim() || null,
          unit: unit.trim() || null,
          reason: reason.trim(),
          estCost: Number(estCost) || 0,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setItemName('');
      setQty('');
      setUnit('');
      setReason('');
      setEstCost('');
      setOpen(false);
      setStatus('idle');
      load();
    } catch {
      setStatus('idle');
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await fetch(`/api/wastage/${id}`, { method: 'DELETE' });
    load();
  };

  const totalCost = entries.reduce((s, e) => s + e.estCost, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('navWastage')}</h1>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md bg-[#8b2e2e] px-3 py-1.5 text-sm text-white"
        >
          {open ? t('close') : t('addWastage')}
        </button>
      </div>

      <p className="text-xs text-[#8a7a6a]">{t('wastageHelp')}</p>

      {open && (
        <section className="space-y-3 rounded-lg bg-[#e8e0d2] p-3">
          <div className="grid gap-2 sm:grid-cols-3">
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
              <label className="text-xs text-[#7a6a5a]">{t('wastageItem')}</label>
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[#7a6a5a]">{t('wastageQty')}</label>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="5 kg"
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[#7a6a5a]">{t('wastageReason')}</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="spoiled / damaged / wilted"
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[#7a6a5a]">{t('wastageCost')}</label>
              <input
                value={estCost}
                onChange={(e) => setEstCost(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={status === 'saving' || !itemName.trim()}
            className="w-full rounded-md bg-[#2d6b4f] py-2 font-semibold text-white disabled:opacity-50"
          >
            {status === 'saving' ? t('saving') : t('addWastage')}
          </button>
        </section>
      )}

      {loading && <p className="text-sm text-[#8a7a6a]">{t('loading')}</p>}
      {!loading && entries.length === 0 && (
        <p className="rounded-lg bg-[#e8e0d2] p-4 text-center text-sm text-[#8a7a6a]">{t('noWastage')}</p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          <div className="text-right text-sm font-semibold text-[#8b2e2e]">
            {t('totalWastage')}: {fmt(totalCost)}
          </div>
          {entries.map((e) => (
            <div key={e.id} className="rounded-lg bg-[#e8e0d2] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-[#7a6a5a]">{fmtDate(e.date)}</p>
                  <p className="text-sm font-medium">{e.itemName}</p>
                  {e.reason && <p className="text-[11px] text-[#7a6a5a]">{e.reason}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[#8b2e2e]">{fmt(e.estCost)}</p>
                  {e.qty && <p className="text-[11px] text-[#7a6a5a]">{e.qty}{e.unit ? ` ${e.unit}` : ''}</p>}
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
