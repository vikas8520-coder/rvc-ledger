'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const CLERK_CONFIGURED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function OnboardingPage() {
  const router = useRouter();
  // Safe Clerk hook wrappers — only call when Clerk is configured
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(!CLERK_CONFIGURED);

  useEffect(() => {
    if (!CLERK_CONFIGURED) return;
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('/api/me');
        const d = await r.json();
        if (mounted && d.authenticated) {
          setUser({ id: d.userId, email: d.email, name: d.name });
        }
        if (mounted) setIsLoaded(true);
      } catch {
        if (mounted) setIsLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const signOut = async () => {
    if (!CLERK_CONFIGURED) return;
    router.push('/');
  };
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push('/sign-in');
      return;
    }
    // Check if user already has a shop
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.shopId) {
          router.push('/');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [isLoaded, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) {
      setError('Shop name is required');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: shopName.trim(),
          shopAddress: shopAddress.trim(),
          shopPhone: shopPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create shop');
      router.push('/');
    } catch (err: any) {
      setStatus('error');
      setError(err.message);
    }
  };

  if (checking || !isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
        <p className="text-sm text-[var(--text-faint)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[var(--bg-primary)]">Welcome to RVC Ledger</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Set up your shop to get started. You can change these later in Settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-[var(--bg-input)] p-6 shadow-lg border border-[var(--border-light)]">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Shop name *</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="My Vegetable Shop"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--bg-primary)]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Address</label>
            <input
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              placeholder="Market, City"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--bg-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Phone</label>
            <input
              value={shopPhone}
              onChange={(e) => setShopPhone(e.target.value)}
              placeholder="+91 98XXX XXXXX"
              inputMode="tel"
              className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--bg-primary)]"
            />
          </div>

          {error && <p className="text-sm text-[var(--bg-primary)]">{error}</p>}

          <button
            type="submit"
            disabled={status === 'saving'}
            className="w-full rounded-md bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)] disabled:opacity-50"
          >
            {status === 'saving' ? 'Creating your shop…' : 'Create my shop'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => signOut()}
            className="text-xs text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
