'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (d.error) {
        setError(d.error);
        setLoading(false);
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-gray-800 p-6 shadow-lg border border-gray-700">
        {/* Admin header — distinct from shop login */}
        <div className="text-center border-b border-gray-700 pb-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-700 px-3 py-1 mb-2">
            <svg className="h-3.5 w-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">Admin Only</span>
          </div>
          <h1 className="text-xl font-bold text-white">RVC Ledger Admin</h1>
          <p className="text-sm text-gray-400 mt-1">Superadmin Control Panel</p>
        </div>

        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400">Admin Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="Enter admin username"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="Enter admin password"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-900/50 px-3 py-2 text-xs text-red-300 border border-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Logging in…' : 'Admin Login'}
          </button>
        </form>

        {/* Clear separation — link to shop login */}
        <div className="border-t border-gray-700 pt-4 text-center">
          <p className="text-[11px] text-gray-500">
            This is <strong className="text-gray-400">not</strong> the shop login.
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            Shop staff?{' '}
            <a href="/" className="font-semibold text-blue-400 underline">Click here for Shop Ledger →</a>
          </p>
        </div>
      </div>
    </div>
  );
}
