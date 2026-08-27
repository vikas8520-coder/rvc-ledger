'use client';

import { useEffect, useState, useRef } from 'react';
import { useI18n } from '../components/I18nProvider';

export default function SettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Shop profile fields
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [profileStatus, setProfileStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Low stock threshold
  const [lowStock, setLowStock] = useState('');
  const [stockStatus, setStockStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Restore
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'restoring' | 'done' | 'error'>('idle');
  const [restoreMsg, setRestoreMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Clear data
  const [clearMode, setClearMode] = useState<'before' | 'all'>('before');
  const [clearDate, setClearDate] = useState('');
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle');
  const [clearMsg, setClearMsg] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        setSettings(s);
        setShopName(s.shopName || '');
        setShopAddress(s.shopAddress || '');
        setShopPhone(s.shopPhone || '');
        setLowStock(s.lowStockThreshold || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async () => {
    setProfileStatus('saving');
    try {
      await Promise.all([
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'shopName', value: shopName }) }),
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'shopAddress', value: shopAddress }) }),
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'shopPhone', value: shopPhone }) }),
      ]);
      setProfileStatus('saved');
      setTimeout(() => setProfileStatus('idle'), 1500);
    } catch {
      setProfileStatus('idle');
    }
  };

  const saveLowStock = async () => {
    setStockStatus('saving');
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'lowStockThreshold', value: lowStock }) });
      setStockStatus('saved');
      setTimeout(() => setStockStatus('idle'), 1500);
    } catch {
      setStockStatus('idle');
    }
  };

  const downloadBackup = () => {
    window.location.href = '/api/backup';
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreStatus('restoring');
    setRestoreMsg('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Restore failed');
      setRestoreStatus('done');
      setRestoreMsg(result.restored?.join(', ') || 'Restored successfully');
    } catch (err: any) {
      setRestoreStatus('error');
      setRestoreMsg(err.message || 'Invalid backup file');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const doClear = async () => {
    setClearStatus('clearing');
    setClearMsg('');
    try {
      const res = await fetch('/api/clear-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: clearMode, date: clearDate, confirm: true }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Clear failed');
      setClearStatus('done');
      setClearMsg(`${result.deleted} entries deleted`);
      setClearConfirm(false);
    } catch (err: any) {
      setClearStatus('error');
      setClearMsg(err.message || 'Clear failed');
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-[#8a7a6a]">{t('loading')}</p>;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{t('settings')}</h1>

      {/* Shop Profile */}
      <section className="rounded-lg bg-[#e8e0d2] p-4">
        <h2 className="text-sm font-semibold">{t('shopProfile')}</h2>
        <p className="mt-1 text-xs text-[#8a7a6a]">{t('shopProfileHelp')}</p>
        <div className="mt-3 space-y-2">
          <div>
            <label className="text-xs text-[#7a6a5a]">{t('shopName')}</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="RVC Vegetable Shop"
              className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[#7a6a5a]">{t('shopAddress')}</label>
            <input
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              placeholder="Bowenpally, Hyderabad"
              className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[#7a6a5a]">{t('shopPhone')}</label>
            <input
              value={shopPhone}
              onChange={(e) => setShopPhone(e.target.value)}
              placeholder="+91 98XXX XXXXX"
              inputMode="tel"
              className="w-full rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={saveProfile}
            disabled={profileStatus === 'saving'}
            className="rounded-md bg-[#2d6b4f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {profileStatus === 'saved' ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* Low Stock Alert */}
      <section className="rounded-lg bg-[#e8e0d2] p-4">
        <h2 className="text-sm font-semibold">{t('lowStockAlert')}</h2>
        <p className="mt-1 text-xs text-[#8a7a6a]">{t('lowStockHelp')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={lowStock}
            onChange={(e) => setLowStock(e.target.value)}
            placeholder="5"
            inputMode="decimal"
            className="w-24 rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-[#7a6a5a]">{t('kgOrUnit')}</span>
          <button
            onClick={saveLowStock}
            disabled={stockStatus === 'saving'}
            className="rounded-md bg-[#2d6b4f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {stockStatus === 'saved' ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* Backup & Restore */}
      <section className="rounded-lg bg-[#e8e0d2] p-4">
        <h2 className="text-sm font-semibold">{t('backupRestore')}</h2>
        <p className="mt-1 text-xs text-[#8a7a6a]">{t('backupHelp')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={downloadBackup}
            className="rounded-md bg-[#2d6b4f] px-4 py-2 text-sm font-semibold text-white"
          >
            {t('downloadBackup')}
          </button>
          <label className="cursor-pointer rounded-md bg-[#5a4a3a] px-4 py-2 text-sm font-semibold text-white">
            {t('restoreBackup')}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleRestore}
              className="hidden"
            />
          </label>
        </div>
        {restoreStatus === 'restoring' && (
          <p className="mt-2 text-xs text-[#7a6a5a]">{t('restoring')}…</p>
        )}
        {restoreStatus === 'done' && (
          <p className="mt-2 text-xs text-[#2d6b4f]">✓ {t('restoreSuccess')}: {restoreMsg}</p>
        )}
        {restoreStatus === 'error' && (
          <p className="mt-2 text-xs text-[#8b2e2e]">✗ {restoreMsg}</p>
        )}
        <p className="mt-2 text-[11px] text-[#8b2e2e]">⚠ {t('restoreWarning')}</p>
      </section>

      {/* Clear Old Data */}
      <section className="rounded-lg border border-[#d4a8a8] bg-[#f5e8e8] p-4">
        <h2 className="text-sm font-semibold text-[#8b2e2e]">{t('clearData')}</h2>
        <p className="mt-1 text-xs text-[#8a7a6a]">{t('clearDataHelp')}</p>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                checked={clearMode === 'before'}
                onChange={() => setClearMode('before')}
              />
              {t('clearBeforeDate')}
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                checked={clearMode === 'all'}
                onChange={() => setClearMode('all')}
              />
              {t('clearAll')}
            </label>
          </div>
          {clearMode === 'before' && (
            <input
              type="date"
              value={clearDate}
              onChange={(e) => setClearDate(e.target.value)}
              className="rounded-md border border-[#c9c0b2] bg-white px-2 py-1.5 text-sm"
            />
          )}
          {clearMode === 'all' && (
            <p className="text-xs text-[#8b2e2e]">{t('clearAllWarning')}</p>
          )}
          <label className="flex items-center gap-1.5 text-sm text-[#8b2e2e]">
            <input
              type="checkbox"
              checked={clearConfirm}
              onChange={(e) => setClearConfirm(e.target.checked)}
            />
            {t('clearConfirm')}
          </label>
          <button
            onClick={doClear}
            disabled={clearStatus === 'clearing' || !clearConfirm || (clearMode === 'before' && !clearDate)}
            className="rounded-md bg-[#8b2e2e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {clearStatus === 'clearing' ? t('clearing') + '…' : t('clearDataBtn')}
          </button>
          {clearStatus === 'done' && (
            <p className="text-xs text-[#2d6b4f]">✓ {clearMsg}</p>
          )}
          {clearStatus === 'error' && (
            <p className="text-xs text-[#8b2e2e]">✗ {clearMsg}</p>
          )}
        </div>
      </section>
    </div>
  );
}
