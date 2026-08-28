'use client';

import { useEffect, useState } from 'react';

type Shop = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  billing_status: string;
  trial_ends: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  customer_count: number;
  txn_count: number;
};

export default function AdminPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    fetch('/api/admin/shops')
      .then((r) => r.json())
      .then((d) => {
        if (d.shops) setShops(d.shops);
        else if (d.error) setError(d.error);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (shop: Shop) => {
    await fetch('/api/admin/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: shop.id, action: 'toggleActive' }),
    });
    load();
  };

  const setBilling = async (shop: Shop, status: string) => {
    await fetch('/api/admin/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: shop.id, action: 'setBilling', status }),
    });
    load();
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-[var(--text-faint)]">Loading…</p>;
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-[var(--bg-primary)]">{error}</p>;
  }

  const statusColors: Record<string, string> = {
    trial: 'bg-[var(--bg-warning)] text-[var(--text-primary)]',
    active: 'bg-[var(--bg-success)] text-[var(--text-on-primary)]',
    expired: 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]',
    suspended: 'bg-[var(--bg-secondary)] text-[var(--text-on-primary)]',
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">All Shops</h1>
      <p className="text-xs text-[var(--text-faint)]">{shops.length} shop{shops.length !== 1 ? 's' : ''} registered</p>

      {shops.length === 0 ? (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">No shops yet.</p>
      ) : (
        <div className="space-y-3">
          {shops.map((shop) => (
            <div key={shop.id} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-[var(--text-primary)]">{shop.name}</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {shop.address || 'No address'}{shop.phone ? ` · ${shop.phone}` : ''}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Owner: {shop.owner_name || 'Unknown'} {shop.owner_email ? `· ${shop.owner_email}` : ''}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {shop.customer_count} customers · {shop.txn_count} transactions
                  </p>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                    Joined {new Date(shop.created_at).toLocaleDateString('en-IN')}
                    {shop.trial_ends ? ` · Trial ends ${new Date(shop.trial_ends).toLocaleDateString('en-IN')}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[shop.billing_status] || statusColors.suspended}`}>
                    {shop.billing_status}
                  </span>
                  {!shop.active && (
                    <span className="rounded-full bg-[var(--bg-primary)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-on-primary)]">
                      INACTIVE
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border-card)] pt-3">
                <button
                  onClick={() => toggleActive(shop)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    shop.active
                      ? 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                      : 'bg-[var(--bg-success)] text-[var(--text-on-primary)] hover:bg-[var(--bg-success-hover)]'
                  }`}
                >
                  {shop.active ? 'Deactivate' : 'Activate'}
                </button>
                <select
                  value={shop.billing_status}
                  onChange={(e) => setBilling(shop, e.target.value)}
                  className="rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active (paid)</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended</option>
                </select>
                <a
                  href={`/api/admin/shops/${shop.id}/data`}
                  className="rounded-md bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]"
                >
                  View data
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
