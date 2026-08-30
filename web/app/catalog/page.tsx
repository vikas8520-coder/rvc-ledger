'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { fmt } from '@/lib/format';
import { CatalogItem } from '@/lib/types';
import { localizeItem } from '@/lib/i18n';

const empty: Omit<CatalogItem, 'id'> = {
  name: '',
  defaultUnit: 'kg',
  defaultSellPrice: null,
  teluguName: null,
  hindiName: null,
  active: true,
  aliases: [],
};

export default function CatalogPage() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<Omit<CatalogItem, 'id'>>(empty);
  const [aliasText, setAliasText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');

  const load = () => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startEdit = (item: CatalogItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      defaultUnit: item.defaultUnit,
      defaultSellPrice: item.defaultSellPrice,
      teluguName: item.teluguName,
      hindiName: item.hindiName,
      active: item.active,
      aliases: item.aliases,
    });
    setAliasText(item.aliases.join(', '));
    setOpen(true);
  };

  const startAdd = () => {
    setEditing(null);
    setForm({ ...empty });
    setAliasText('');
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setStatus('saving');
    const aliases = aliasText.split(',').map((a) => a.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: editing?.id, aliases }),
      });
      if (!res.ok) throw new Error('Save failed');
      setOpen(false);
      setStatus('idle');
      load();
    } catch {
      setStatus('idle');
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await fetch(`/api/catalog/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('navCatalog')}</h1>
        <button onClick={startAdd} className="rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)]">
          {t('addItem')}
        </button>
      </div>

      <p className="text-xs text-[var(--text-faint)]">{t('catalogHelp')}</p>

      {open && (
        <section className="space-y-3 rounded-lg bg-[var(--bg-card)] p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('itemName')}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('defaultUnit')}</label>
              <input
                value={form.defaultUnit || ''}
                onChange={(e) => setForm({ ...form, defaultUnit: e.target.value || null })}
                placeholder="kg / bag / pcs"
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('defaultPrice')}</label>
              <input
                value={form.defaultSellPrice ?? ''}
                onChange={(e) => setForm({ ...form, defaultSellPrice: e.target.value ? Number(e.target.value) : null })}
                inputMode="decimal"
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('teluguName')}</label>
              <input
                value={form.teluguName || ''}
                onChange={(e) => setForm({ ...form, teluguName: e.target.value || null })}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('hindiName')}</label>
              <input
                value={form.hindiName || ''}
                onChange={(e) => setForm({ ...form, hindiName: e.target.value || null })}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('active')}</label>
              <select
                value={form.active ? '1' : '0'}
                onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}
                className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
              >
                <option value="1">{t('active')}</option>
                <option value="0">—</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('aliases')}</label>
            <input
              value={aliasText}
              onChange={(e) => setAliasText(e.target.value)}
              placeholder="mirchi, mirapakaya, మిర్చి"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={status === 'saving' || !form.name.trim()}
              className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
            >
              {status === 'saving' ? t('saving') : t('savePurchase')}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-4 py-2 text-sm">
              {t('close')}
            </button>
          </div>
        </section>
      )}

      {loading && <p className="text-sm text-[var(--text-faint)]">{t('loading')}</p>}
      {!loading && items.length === 0 && (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">{t('noCatalogItems')}</p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg bg-[var(--bg-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-[var(--text-muted)]">
                <th className="px-3 py-2">{t('itemName')}</th>
                <th className="px-3 py-2">{t('defaultUnit')}</th>
                <th className="px-3 py-2 text-right">{t('defaultPrice')}</th>
                <th className="px-3 py-2">{t('aliases')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-[var(--border-light)]">
                  <td className="px-3 py-2 font-medium">{localizeItem(it, lang)}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{it.defaultUnit || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.defaultSellPrice ? fmt(it.defaultSellPrice) : '—'}</td>
                  <td className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{it.aliases.join(', ')}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => startEdit(it)} className="text-xs text-[var(--bg-success)] hover:underline">
                      {t('editItem')}
                    </button>
                    <button onClick={() => remove(it.id)} className="ml-2 text-xs text-[var(--bg-primary)] hover:underline">
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
