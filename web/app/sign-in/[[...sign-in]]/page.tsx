'use client';

import { useState } from 'react';
import { SignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'owner' | 'dataentry'>('owner');
  const [dePassword, setDePassword] = useState('');
  const [deError, setDeError] = useState('');
  const [deLoading, setDeLoading] = useState(false);

  const dataEntryLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeLoading(true);
    setDeError('');
    try {
      // Clear any existing Clerk session first
      // (can't call signOut here since we're not in Clerk context,
      // but the API will set the data-entry cookie which takes priority)
      const r = await fetch('/api/data-entry-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: dePassword }),
      });
      const d = await r.json();
      if (d.error) {
        setDeError(d.error);
        setDeLoading(false);
        return;
      }
      // Redirect to entry — the data-entry cookie will take priority
      window.location.href = '/entry';
    } catch (err: any) {
      setDeError(err.message || 'Login failed');
      setDeLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-primary)] px-3 py-1 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-on-primary)]">Shop Ledger</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--bg-primary)]">RVC Ledger</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Sign in to access your shop</p>
        </div>

        {/* Tab switcher */}
        <div className="mb-4 flex rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] p-1">
          <button
            onClick={() => setTab('owner')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              tab === 'owner'
                ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Owner Login
          </button>
          <button
            onClick={() => setTab('dataentry')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              tab === 'dataentry'
                ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Data Entry Login
          </button>
        </div>

        {tab === 'owner' ? (
          <SignIn appearance={{
            elements: {
              rootBox: 'mx-auto w-full',
              card: 'bg-[var(--bg-input)] shadow-lg rounded-xl border border-[var(--border-light)]',
              headerTitle: 'text-[var(--bg-primary)]',
              headerSubtitle: 'text-[var(--text-muted)]',
              socialButtonsBlockButton: 'border-[var(--border-light)]',
              formButtonPrimary: 'bg-[var(--bg-primary)] hover:bg-[var(--bg-primary-hover)] text-[var(--text-on-primary)]',
              footerActionLink: 'text-[var(--bg-primary)] hover:text-[var(--bg-primary-hover)]',
            },
          }} />
        ) : (
          <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-input)] p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-[var(--bg-primary)]">Data Entry Login</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Enter the password shared by your shop owner</p>
            <form onSubmit={dataEntryLogin} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Password</label>
                <input
                  type="password"
                  value={dePassword}
                  onChange={(e) => setDePassword(e.target.value)}
                  autoFocus
                  required
                  className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--bg-primary)]"
                  placeholder="Enter password"
                />
              </div>
              {deError && <p className="text-sm text-red-500">{deError}</p>}
              <button
                type="submit"
                disabled={deLoading || !dePassword}
                className="w-full rounded-lg bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] disabled:opacity-50"
              >
                {deLoading ? 'Logging in…' : 'Log In'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
