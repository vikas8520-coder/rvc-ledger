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

  // Bill format
  const [billFormat, setBillFormat] = useState<'simple' | 'itemized' | 'market' | 'patti'>('itemized');
  const [billFormatStatus, setBillFormatStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Commission %
  const [commissionPct, setCommissionPct] = useState('');
  const [commissionStatus, setCommissionStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // FY close
  const [fyStatus, setFyStatus] = useState<'idle' | 'closing' | 'done' | 'error'>('idle');
  const [fyMsg, setFyMsg] = useState('');

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

  // Subscription status
  const [subStatus, setSubStatus] = useState<any>(null);
  const [subPayments, setSubPayments] = useState<any[]>([]);
  const [subPlans, setSubPlans] = useState<any[]>([]);

  // User profile (owner vs data_entry)
  const [userProfile, setUserProfile] = useState<'owner' | 'data_entry'>('owner');

  // Data entry account
  const [deExists, setDeExists] = useState(false);
  const [deStatus, setDeStatus] = useState<'idle' | 'creating' | 'created' | 'changing' | 'changed' | 'deleting' | 'error'>('idle');
  const [dePassword, setDePassword] = useState('');
  const [deError, setDeError] = useState('');
  const [deShopNumber, setDeShopNumber] = useState('');
  const [deNewPassword, setDeNewPassword] = useState('');
  const [deExistingShopNumber, setDeExistingShopNumber] = useState('');

  // Data entry user self-service password change
  const [deCurrentPw, setDeCurrentPw] = useState('');
  const [deNewPw, setDeNewPw] = useState('');
  const [deChangeStatus, setDeChangeStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deChangeMsg, setDeChangeMsg] = useState('');

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
        setBillFormat((s.billFormat as any) || 'itemized');
        setCommissionPct(s.commissionPct || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load subscription status
    fetch('/api/subscription')
      .then((r) => r.json())
      .then((d) => {
        if (d.status) setSubStatus(d.status);
        if (d.payments) setSubPayments(d.payments);
        if (d.plans) setSubPlans(d.plans);
      })
      .catch(() => {});

    // Load user profile and data-entry account info
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) setUserProfile(d.profile);
        if (d.profile === 'owner' || d.role === 'superadmin') {
          fetchDeAccount();
        }
      })
      .catch(() => {});
  }, []);

  const fetchDeAccount = () => {
    fetch('/api/data-entry-account')
      .then((r) => r.json())
      .then((d) => {
        setDeExists(!!d.exists);
        if (d.shopNumber) setDeExistingShopNumber(d.shopNumber);
      })
      .catch(() => {});
  };

  const createDeAccount = async () => {
    if (!deShopNumber.trim() || !deNewPassword.trim()) {
      setDeError('Shop number and password are both required');
      setDeStatus('error');
      return;
    }
    setDeStatus('creating');
    setDeError('');
    try {
      const res = await fetch('/api/data-entry-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopNumber: deShopNumber.trim(), password: deNewPassword.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Failed (HTTP ${res.status})`);
      setDePassword(d.password);
      setDeExistingShopNumber(d.shopNumber);
      setDeStatus('created');
      setDeShopNumber('');
      setDeNewPassword('');
      fetchDeAccount();
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Failed to create';
      setDeError(msg);
      setDeStatus('error');
    }
  };

  const changeDePassword = async () => {
    if (!deShopNumber.trim() || !deNewPassword.trim()) {
      setDeError('Shop number and new password are both required');
      setDeStatus('error');
      return;
    }
    setDeStatus('changing');
    setDeError('');
    try {
      const res = await fetch('/api/data-entry-account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopNumber: deShopNumber.trim(), password: deNewPassword.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to change password');
      setDePassword(d.password);
      setDeExistingShopNumber(d.shopNumber);
      setDeStatus('changed');
      setDeShopNumber('');
      setDeNewPassword('');
    } catch (e: any) {
      setDeError(e.message);
      setDeStatus('error');
    }
  };

  const deleteDeAccount = async () => {
    setDeStatus('deleting');
    setDeError('');
    try {
      const res = await fetch('/api/data-entry-account', { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to delete');
      }
      setDePassword('');
      setDeStatus('idle');
      fetchDeAccount();
    } catch (e: any) {
      setDeError(e.message);
      setDeStatus('error');
    }
  };

  const changeDeOwnPassword = async () => {
    setDeChangeStatus('saving');
    setDeChangeMsg('');
    try {
      const res = await fetch('/api/data-entry-change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: deCurrentPw, newPassword: deNewPw }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to change password');
      setDeChangeStatus('saved');
      setDeChangeMsg('Password changed successfully');
      setDeCurrentPw('');
      setDeNewPw('');
      setTimeout(() => { setDeChangeStatus('idle'); setDeChangeMsg(''); }, 2000);
    } catch (e: any) {
      setDeChangeMsg(e.message);
      setDeChangeStatus('error');
    }
  };

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

  const saveBillFormat = async () => {
    setBillFormatStatus('saving');
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'billFormat', value: billFormat }) });
      setBillFormatStatus('saved');
      setTimeout(() => setBillFormatStatus('idle'), 1500);
    } catch {
      setBillFormatStatus('idle');
    }
  };

  const saveCommission = async () => {
    setCommissionStatus('saving');
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'commissionPct', value: commissionPct }) });
      setCommissionStatus('saved');
      setTimeout(() => setCommissionStatus('idle'), 1500);
    } catch {
      setCommissionStatus('idle');
    }
  };

  const closeFY = async () => {
    setFyStatus('closing');
    setFyMsg('');
    try {
      const res = await fetch('/api/fy/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Close failed');
      setFyStatus('done');
      setFyMsg(`FY ${result.fyStartYear}-${String((result.fyStartYear + 1) % 100).padStart(2, '0')} closed. ${result.customersClosed} customers processed.`);
    } catch (err: any) {
      setFyStatus('error');
      setFyMsg(err.message || 'Close failed');
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
    return <p className="py-10 text-center text-sm text-[var(--text-faint)]">{t('loading')}</p>;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{t('settings')}</h1>

      {/* Data Entry user — self-service password change + logout */}
      {userProfile === 'data_entry' && (
        <>
          <section className="rounded-lg bg-[var(--bg-card)] p-4">
            <h2 className="text-sm font-semibold">Change Password</h2>
            <p className="mt-1 text-xs text-[var(--text-faint)]">Change the password you use to log in</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Current Password</label>
                <input
                  type="password"
                  value={deCurrentPw}
                  onChange={(e) => setDeCurrentPw(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">New Password</label>
                <input
                  type="password"
                  value={deNewPw}
                  onChange={(e) => setDeNewPw(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
                  placeholder="Enter new password (min 4 chars)"
                />
              </div>
              <button
                onClick={changeDeOwnPassword}
                disabled={deChangeStatus === 'saving' || !deCurrentPw || !deNewPw || deNewPw.length < 4}
                className="rounded-md bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
              >
                {deChangeStatus === 'saving' ? 'Saving…' : 'Change Password'}
              </button>
              {deChangeStatus === 'saved' && (
                <p className="text-xs text-[var(--bg-success)]">✓ {deChangeMsg}</p>
              )}
              {deChangeStatus === 'error' && (
                <p className="text-xs text-red-500">✗ {deChangeMsg}</p>
              )}
            </div>
          </section>

          <section className="rounded-lg bg-[var(--bg-card)] p-4">
            <h2 className="text-sm font-semibold">Language & Theme</h2>
            <p className="mt-1 text-xs text-[var(--text-faint)]">Use the buttons in the top bar to switch language and theme</p>
          </section>

          <section className="rounded-lg border border-red-200 bg-red-50 p-4 dark:bg-red-950/20">
            <h2 className="text-sm font-semibold text-red-600">Logout</h2>
            <p className="mt-1 text-xs text-[var(--text-faint)]">Sign out of your data entry account</p>
            <button
              onClick={async () => {
                await fetch('/api/data-entry-logout', { method: 'POST' });
                window.location.href = '/sign-in';
              }}
              className="mt-3 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600"
            >
              Logout
            </button>
          </section>
        </>
      )}

      {/* Admin-only sections below */}
      {userProfile !== 'data_entry' && (
        <>

      {/* Subscription Status */}
      {subStatus && (
        <section className="rounded-lg bg-[var(--bg-card)] p-4">
          <h2 className="text-sm font-semibold">Subscription</h2>
          {subStatus.status === 'none' ? (
            <div className="mt-2">
              <p className="text-xs text-[var(--text-faint)]">No active subscription. Contact your administrator to activate.</p>
              {subPlans.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {subPlans.map((p) => (
                    <div key={p.id} className="rounded-lg border border-[var(--border-light)] p-3">
                      <p className="text-sm font-semibold">{p.label}</p>
                      <p className="text-lg font-bold text-[var(--text-primary)]">₹{p.price.toLocaleString('en-IN')}<span className="text-xs font-normal text-[var(--text-faint)]">/year</span></p>
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">Up to {p.maxShops} shop{p.maxShops !== 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap gap-3">
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  subStatus.status === 'active' ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                }`}>
                  {subStatus.status === 'active' ? '✓ Active' : 'Expired'}
                </div>
                {subStatus.plan && (
                  <span className="rounded-full bg-[var(--bg-card-hover)] px-3 py-1 text-xs font-medium capitalize">
                    {subPlans.find((p) => p.id === subStatus.plan)?.label || subStatus.plan}
                  </span>
                )}
                {subStatus.status === 'active' && (
                  <span className="text-xs text-[var(--text-faint)] py-1">
                    {subStatus.daysRemaining} days remaining · Until {subStatus.coversTo}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-faint)]">Total paid: ₹{subStatus.totalPaid.toLocaleString('en-IN')}</p>

              {subPayments.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[var(--text-faint)]">
                        <th className="p-1.5">Date</th>
                        <th className="p-1.5 text-right">Amount</th>
                        <th className="p-1.5">Method</th>
                        <th className="p-1.5">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subPayments.map((p) => (
                        <tr key={p.id} className="border-t border-[var(--border-card)]">
                          <td className="p-1.5 whitespace-nowrap">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                          <td className="p-1.5 text-right font-semibold">₹{p.amount.toLocaleString('en-IN')}</td>
                          <td className="p-1.5 capitalize">{p.payment_method}</td>
                          <td className="p-1.5 text-[var(--text-faint)]">{p.covers_from} → {p.covers_to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Data Entry Account — admin only */}
      {userProfile === 'owner' && (
        <section className="rounded-lg bg-[var(--bg-card)] p-4">
          <h2 className="text-sm font-semibold">Data Entry Profile</h2>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Set a Shop ID (e.g. B-11) and password. Share both with your employee — they log in with these on the Data Entry Login tab.
          </p>

          <div className="mt-3 space-y-3">
            {/* Existing account info */}
            {deExists && (
              <div className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] p-3">
                <p className="text-xs text-[var(--text-muted)]">Current Shop ID:</p>
                <p className="text-sm font-medium font-mono break-all">{deExistingShopNumber || '(not set)'}</p>
                <p className="mt-2 text-[11px] text-[var(--text-faint)]">
                  The data entry person uses this Shop ID + the password you set to log in.
                </p>
                <div className="mt-3">
                  <button
                    onClick={deleteDeAccount}
                    disabled={deStatus === 'deleting'}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50"
                  >
                    {deStatus === 'deleting' ? 'Removing…' : 'Remove Data Entry Access'}
                  </button>
                </div>
              </div>
            )}

            {/* Shop number + password input form (for create or change) */}
            <div className="rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                  Shop ID {deExists ? '(update)' : ''}
                </label>
                <input
                  type="text"
                  value={deShopNumber}
                  onChange={(e) => setDeShopNumber(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm"
                  placeholder="e.g. B-11"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                  Password {deExists ? '(new)' : '(min 4 chars)'}
                </label>
                <input
                  type="text"
                  value={deNewPassword}
                  onChange={(e) => setDeNewPassword(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono"
                  placeholder="Enter password"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!deExists ? (
                  <button
                    onClick={createDeAccount}
                    disabled={deStatus === 'creating' || !deShopNumber.trim() || !deNewPassword.trim()}
                    className="rounded-md bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
                  >
                    {deStatus === 'creating' ? 'Creating…' : 'Create Data Entry Profile'}
                  </button>
                ) : (
                  <button
                    onClick={changeDePassword}
                    disabled={deStatus === 'changing' || !deShopNumber.trim() || !deNewPassword.trim()}
                    className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
                  >
                    {deStatus === 'changing' ? 'Updating…' : 'Update Shop ID / Password'}
                  </button>
                )}
              </div>
            </div>

            {/* Success message after create/change */}
            {deStatus === 'created' && dePassword && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 dark:bg-green-950/20">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                  ✓ Data Entry profile created!
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Shop ID: <span className="font-mono font-medium">{deExistingShopNumber}</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Password: <span className="font-mono font-medium">{dePassword}</span>
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                  Share this Shop ID and password with your employee.
                </p>
              </div>
            )}

            {deStatus === 'changed' && dePassword && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 dark:bg-green-950/20">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                  ✓ Data Entry profile updated!
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Shop ID: <span className="font-mono font-medium">{deExistingShopNumber}</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Password: <span className="font-mono font-medium">{dePassword}</span>
                </p>
              </div>
            )}

            {deStatus === 'error' && deError && (
              <p className="text-xs text-red-500">✗ {deError}</p>
            )}
          </div>
        </section>
      )}

      {/* Shop Profile */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{t('shopProfile')}</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">{t('shopProfileHelp')}</p>
        <div className="mt-3 space-y-2">
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('shopName')}</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="RVC Vegetable Shop"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('shopAddress')}</label>
            <input
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              placeholder="Bowenpally, Hyderabad"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">{t('shopPhone')}</label>
            <input
              value={shopPhone}
              onChange={(e) => setShopPhone(e.target.value)}
              placeholder="+91 98XXX XXXXX"
              inputMode="tel"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={saveProfile}
            disabled={profileStatus === 'saving'}
            className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {profileStatus === 'saved' ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* Low Stock Alert */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{t('lowStockAlert')}</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">{t('lowStockHelp')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={lowStock}
            onChange={(e) => setLowStock(e.target.value)}
            placeholder="5"
            inputMode="decimal"
            className="w-24 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-[var(--text-muted)]">{t('kgOrUnit')}</span>
          <button
            onClick={saveLowStock}
            disabled={stockStatus === 'saving'}
            className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {stockStatus === 'saved' ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* Bill Format */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{t('billFormat')}</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">{t('billFormatHelp')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={billFormat}
            onChange={(e) => setBillFormat(e.target.value as any)}
            className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-1.5 text-sm"
          >
            <option value="simple">{t('billFormatSimple')}</option>
            <option value="itemized">{t('billFormatItemized')}</option>
            <option value="market">{t('billFormatMarket')}</option>
            <option value="patti">{t('billFormatPatti')}</option>
          </select>
          <button
            onClick={saveBillFormat}
            disabled={billFormatStatus === 'saving'}
            className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {billFormatStatus === 'saved' ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* Commission % */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{t('commissionPct')}</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">{t('commissionHelp')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
            placeholder="10"
            inputMode="decimal"
            className="w-24 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-[var(--text-muted)]">%</span>
          <button
            onClick={saveCommission}
            disabled={commissionStatus === 'saving'}
            className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {commissionStatus === 'saved' ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* Financial Year Close */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{t('fyClose')}</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">{t('fyCloseHelp')}</p>
        <div className="mt-3">
          <button
            onClick={closeFY}
            disabled={fyStatus === 'closing'}
            className="rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {fyStatus === 'closing' ? t('closing') + '…' : t('closePrevFY')}
          </button>
          {fyStatus === 'done' && (
            <p className="mt-2 text-xs text-[var(--bg-success)]">✓ {fyMsg}</p>
          )}
          {fyStatus === 'error' && (
            <p className="mt-2 text-xs text-[var(--bg-primary)]">✗ {fyMsg}</p>
          )}
        </div>
      </section>

      {/* Backup & Restore */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{t('backupRestore')}</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">{t('backupHelp')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={downloadBackup}
            className="rounded-md bg-[var(--bg-success)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)]"
          >
            {t('downloadBackup')}
          </button>
          <label className="cursor-pointer rounded-md bg-[var(--bg-secondary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)]">
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
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t('restoring')}…</p>
        )}
        {restoreStatus === 'done' && (
          <p className="mt-2 text-xs text-[var(--bg-success)]">✓ {t('restoreSuccess')}: {restoreMsg}</p>
        )}
        {restoreStatus === 'error' && (
          <p className="mt-2 text-xs text-[var(--bg-primary)]">✗ {restoreMsg}</p>
        )}
        <p className="mt-2 text-[11px] text-[var(--bg-primary)]">⚠ {t('restoreWarning')}</p>
      </section>

      {/* Clear Old Data */}
      <section className="rounded-lg border border-[#d4a8a8] bg-[#f5e8e8] p-4">
        <h2 className="text-sm font-semibold text-[var(--bg-primary)]">{t('clearData')}</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">{t('clearDataHelp')}</p>
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
              className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1.5 text-sm"
            />
          )}
          {clearMode === 'all' && (
            <p className="text-xs text-[var(--bg-primary)]">{t('clearAllWarning')}</p>
          )}
          <label className="flex items-center gap-1.5 text-sm text-[var(--bg-primary)]">
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
            className="rounded-md bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {clearStatus === 'clearing' ? t('clearing') + '…' : t('clearDataBtn')}
          </button>
          {clearStatus === 'done' && (
            <p className="text-xs text-[var(--bg-success)]">✓ {clearMsg}</p>
          )}
          {clearStatus === 'error' && (
            <p className="text-xs text-[var(--bg-primary)]">✗ {clearMsg}</p>
          )}
        </div>
      </section>
        </>
      )}
    </div>
  );
}
