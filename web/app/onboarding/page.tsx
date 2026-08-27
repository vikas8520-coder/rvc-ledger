'use client';

import { useEffect, useState } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
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
      <div className="flex min-h-screen items-center justify-center bg-[#f5f0e6]">
        <p className="text-sm text-[#8a7a6a]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f0e6] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[#8b2e2e]">Welcome to RVC Ledger</h1>
          <p className="mt-1 text-sm text-[#7a6a5a]">
            Set up your shop to get started. You can change these later in Settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-lg border border-[#d9d0c2]">
          <div>
            <label className="block text-xs font-medium text-[#7a6a5a] mb-1">Shop name *</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="My Vegetable Shop"
              className="w-full rounded-md border border-[#c9c0b2] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2e2e]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7a6a5a] mb-1">Address</label>
            <input
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              placeholder="Market, City"
              className="w-full rounded-md border border-[#c9c0b2] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2e2e]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7a6a5a] mb-1">Phone</label>
            <input
              value={shopPhone}
              onChange={(e) => setShopPhone(e.target.value)}
              placeholder="+91 98XXX XXXXX"
              inputMode="tel"
              className="w-full rounded-md border border-[#c9c0b2] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b2e2e]"
            />
          </div>

          {error && <p className="text-sm text-[#8b2e2e]">{error}</p>}

          <button
            type="submit"
            disabled={status === 'saving'}
            className="w-full rounded-md bg-[#8b2e2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6b2222] disabled:opacity-50"
          >
            {status === 'saving' ? 'Creating your shop…' : 'Create my shop'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            className="text-xs text-[#8a7a6a] hover:text-[#5a4a3a]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
