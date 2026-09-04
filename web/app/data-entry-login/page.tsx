'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DataEntryLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/data-entry-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (d.error) {
        setError(d.error);
        setLoading(false);
        return;
      }
      router.push('/entry');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-[var(--bg-card)] p-6 shadow-lg border border-[var(--border-light)]">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-primary)] px-3 py-1 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-on-primary)]">RVC Ledger</span>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Data Entry Login</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Enter the password shared by your shop owner</p>
        </div>

        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--bg-primary)]"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}
