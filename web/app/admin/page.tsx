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
    return <p className="py-10 text-center text-sm text-[#8a7a6a]">Loading…</p>;
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-[#8b2e2e]">{error}</p>;
  }

  const statusColors: Record<string, string> = {
    trial: 'bg-[#c9a227] text-[#3a2f2f]',
    active: 'bg-[#2d6b4f] text-white',
    expired: 'bg-[#8b2e2e] text-white',
    suspended: 'bg-[#5a4a3a] text-white',
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">All Shops</h1>
      <p className="text-xs text-[#8a7a6a]">{shops.length} shop{shops.length !== 1 ? 's' : ''} registered</p>

      {shops.length === 0 ? (
        <p className="rounded-lg bg-[#e8e0d2] p-4 text-center text-sm text-[#8a7a6a]">No shops yet.</p>
      ) : (
        <div className="space-y-3">
          {shops.map((shop) => (
            <div key={shop.id} className="rounded-lg border border-[#d9d0c2] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-[#3a2f2f]">{shop.name}</h2>
                  <p className="text-xs text-[#7a6a5a]">
                    {shop.address || 'No address'}{shop.phone ? ` · ${shop.phone}` : ''}
                  </p>
                  <p className="text-xs text-[#7a6a5a] mt-0.5">
                    Owner: {shop.owner_name || 'Unknown'} {shop.owner_email ? `· ${shop.owner_email}` : ''}
                  </p>
                  <p className="text-xs text-[#7a6a5a] mt-0.5">
                    {shop.customer_count} customers · {shop.txn_count} transactions
                  </p>
                  <p className="text-[11px] text-[#8a7a6a] mt-0.5">
                    Joined {new Date(shop.created_at).toLocaleDateString('en-IN')}
                    {shop.trial_ends ? ` · Trial ends ${new Date(shop.trial_ends).toLocaleDateString('en-IN')}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[shop.billing_status] || statusColors.suspended}`}>
                    {shop.billing_status}
                  </span>
                  {!shop.active && (
                    <span className="rounded-full bg-[#8b2e2e] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      INACTIVE
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ece5d8] pt-3">
                <button
                  onClick={() => toggleActive(shop)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    shop.active
                      ? 'bg-[#e8e0d2] text-[#5a4a3a] hover:bg-[#d9d0c2]'
                      : 'bg-[#2d6b4f] text-white hover:bg-[#22513a]'
                  }`}
                >
                  {shop.active ? 'Deactivate' : 'Activate'}
                </button>
                <select
                  value={shop.billing_status}
                  onChange={(e) => setBilling(shop, e.target.value)}
                  className="rounded-md border border-[#c9c0b2] bg-white px-2 py-1 text-xs"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active (paid)</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended</option>
                </select>
                <a
                  href={`/api/admin/shops/${shop.id}/data`}
                  className="rounded-md bg-[#5a4a3a] px-3 py-1 text-xs font-medium text-white hover:bg-[#4a3a2a]"
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
