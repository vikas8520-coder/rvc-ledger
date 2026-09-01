'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

type Plan = {
  id: string;
  label: string;
  price: number;
  durationMonths: number;
  maxShops: number;
};

type SubscriptionPayment = {
  id: string;
  shop_id: string;
  shop_name: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  plan: string;
  covers_from: string;
  covers_to: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
};

type SubscriptionSummary = {
  totalRevenue: number;
  activeSubscriptions: number;
  expiringSoon: number;
  totalPayments: number;
  recentPayments: SubscriptionPayment[];
};

type MonthlyRevenue = { month: string; revenue: number; count: number };

type Tab = 'shops' | 'payments' | 'pricing' | 'sourcing';

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('shops');
  const [shops, setShops] = useState<Shop[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const load = () => {
    Promise.all([
      fetch('/api/admin/shops').then((r) => r.json()),
      fetch('/api/admin/subscriptions').then((r) => r.json()),
    ])
      .then(([shopData, subData]) => {
        // Any auth error (401 Unauthorized or 403 Admin access required) means not logged in
        const authError = shopData.error || subData.error;
        if (authError === 'Admin access required' || authError === 'Unauthorized') {
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        setIsAdmin(true);
        if (shopData.shops) setShops(shopData.shops);
        else if (shopData.error) setError(shopData.error);
        if (subData.payments) setPayments(subData.payments);
        if (subData.summary) setSummary(subData.summary);
        if (subData.plans) setPlans(subData.plans);
        if (subData.monthlyRevenue) setMonthlyRevenue(subData.monthlyRevenue);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-[var(--text-faint)]">Loading…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="rounded-xl bg-[var(--bg-card)] p-6 text-center shadow-sm">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Admin Access Required</h2>
          <p className="mt-2 text-sm text-[var(--text-faint)]">This is the admin panel for managing all shops.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => router.push('/admin/login')}
              className="rounded-lg bg-[var(--bg-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
            >
              Login as Admin
            </button>
            <Link
              href="/"
              className="rounded-lg border border-[var(--border-input)] px-6 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            >
              Go to Shop Ledger →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-[var(--text-primary)]">{error}</p>;
  }

  const fmtINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Admin Dashboard</h1>
        <button
          onClick={logout}
          className="rounded-md bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
        >
          Logout
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-[var(--bg-card)] p-3">
            <p className="text-[11px] text-[var(--text-faint)]">Total Revenue</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{fmtINR(summary.totalRevenue)}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-card)] p-3">
            <p className="text-[11px] text-[var(--text-faint)]">Active Subs</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{summary.activeSubscriptions}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-card)] p-3">
            <p className="text-[11px] text-[var(--text-faint)]">Expiring (30d)</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{summary.expiringSoon}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-card)] p-3">
            <p className="text-[11px] text-[var(--text-faint)]">Total Shops</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{shops.length}</p>
          </div>
        </div>
      )}

      {/* Revenue chart */}
      {monthlyRevenue.length > 0 && (
        <RevenueChart data={monthlyRevenue} fmtINR={fmtINR} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-light)]">
        {(['shops', 'payments', 'pricing', 'sourcing'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-[var(--bg-primary)] text-[var(--text-primary)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t === 'shops' ? 'Shops' : t === 'payments' ? 'Payments' : t === 'pricing' ? 'Pricing' : 'Sourcing'}
          </button>
        ))}
      </div>

      {tab === 'shops' && <ShopsTab shops={shops} plans={plans} onReload={load} fmtINR={fmtINR} />}
      {tab === 'payments' && <PaymentsTab payments={payments} fmtINR={fmtINR} />}
      {tab === 'pricing' && <PricingTab plans={plans} onReload={load} />}
      {tab === 'sourcing' && <SourcingTab />}
    </div>
  );
}

/* ---- Revenue Chart ---- */

function RevenueChart({ data, fmtINR }: { data: MonthlyRevenue[]; fmtINR: (n: number) => string }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const monthLabels: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  };

  return (
    <div className="rounded-xl bg-[var(--bg-card)] p-4">
      <h2 className="text-sm font-semibold">Monthly Revenue (Last 12 Months)</h2>
      <div className="mt-4 flex items-end gap-2" style={{ height: '120px' }}>
        {data.map((d) => {
          const [, mm] = d.month.split('-');
          const heightPct = (d.revenue / maxRevenue) * 100;
          return (
            <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative w-full" style={{ height: '100px' }}>
                <div
                  className="absolute bottom-0 w-full rounded-t bg-[var(--bg-primary)] transition-all hover:opacity-80"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                  title={`${monthLabels[mm]} ${d.month.split('-')[0]}: ${fmtINR(d.revenue)} (${d.count} payments)`}
                />
              </div>
              <span className="text-[9px] text-[var(--text-faint)]">{monthLabels[mm] || d.month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Shops Tab ---- */

function ShopsTab({ shops, plans, onReload, fmtINR }: {
  shops: Shop[];
  plans: Plan[];
  onReload: () => void;
  fmtINR: (n: number) => string;
}) {
  const [showPaymentFor, setShowPaymentFor] = useState<string | null>(null);
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);
  const [subStatuses, setSubStatuses] = useState<Record<string, any>>({});
  const [extendDays, setExtendDays] = useState('7');
  const [trialDate, setTrialDate] = useState('');

  useEffect(() => {
    shops.forEach(async (shop) => {
      try {
        const r = await fetch(`/api/admin/subscriptions?shopId=${shop.id}`);
        const d = await r.json();
        if (d.status) {
          setSubStatuses((prev) => ({ ...prev, [shop.id]: d.status }));
        }
      } catch {}
    });
  }, [shops]);

  const toggleActive = async (shop: Shop) => {
    await fetch('/api/admin/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: shop.id, action: 'toggleActive' }),
    });
    onReload();
  };

  const setBilling = async (shop: Shop, status: string) => {
    await fetch('/api/admin/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: shop.id, action: 'setBilling', status }),
    });
    onReload();
  };

  const doExtend = async (shop: Shop) => {
    const days = Number(extendDays);
    if (!days) return;
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extend', shopId: shop.id, days }),
    });
    setShowActionsFor(null);
    onReload();
  };

  const doSuspend = async (shop: Shop) => {
    if (!confirm(`Suspend ${shop.name}? They will lose access.`)) return;
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'suspend', shopId: shop.id }),
    });
    onReload();
  };

  const doUnsuspend = async (shop: Shop) => {
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsuspend', shopId: shop.id }),
    });
    onReload();
  };

  const doSetTrial = async (shop: Shop) => {
    if (!trialDate) return;
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setTrial', shopId: shop.id, trialEnds: trialDate }),
    });
    setShowActionsFor(null);
    onReload();
  };

  const statusColors: Record<string, string> = {
    trial: 'bg-[var(--bg-warning)] text-[var(--text-primary)]',
    active: 'bg-[var(--bg-success)] text-[var(--text-on-primary)]',
    expired: 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]',
    suspended: 'bg-[var(--bg-secondary)] text-[var(--text-on-primary)]',
  };

  const planLabel = (planId: string) => plans.find((p) => p.id === planId)?.label || planId;

  return (
    <div className="space-y-3">
      {shops.length === 0 ? (
        <p className="rounded-lg bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--text-faint)]">No shops yet.</p>
      ) : (
        shops.map((shop) => {
          const sub = subStatuses[shop.id];
          return (
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
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[shop.billing_status] || statusColors.suspended}`}>
                    {shop.billing_status}
                  </span>
                  {sub && sub.status !== 'none' && (
                    <div className="text-right">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        sub.status === 'active' ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
                      }`}>
                        Sub: {sub.status}
                      </span>
                      {sub.status === 'active' && (
                        <p className="text-[11px] text-[var(--text-faint)] mt-1">
                          {planLabel(sub.plan)} · {sub.daysRemaining}d left
                          <br />Until {sub.coversTo}
                        </p>
                      )}
                      <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                        Total paid: {fmtINR(sub.totalPaid)}
                      </p>
                    </div>
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
                <button
                  onClick={() => setShowPaymentFor(showPaymentFor === shop.id ? null : shop.id)}
                  className="rounded-md bg-[var(--bg-primary)] px-3 py-1 text-xs font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
                >
                  Record Payment
                </button>
                <button
                  onClick={() => setShowActionsFor(showActionsFor === shop.id ? null : shop.id)}
                  className="rounded-md bg-[var(--bg-card)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                >
                  Manage
                </button>
                <a
                  href={`/admin/shops/${shop.id}`}
                  className="rounded-md bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]"
                >
                  View data
                </a>
                <button
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? window.location.origin : 'https://rvc-ledger-web.vercel.app';
                    navigator.clipboard?.writeText(url).then(() => {
                      alert(`Shop link copied: ${url}\n\nShare this with shop staff. They will sign in at this URL — NOT the /admin/login URL.`);
                    }).catch(() => {
                      prompt('Copy this link to share with shop staff:', url);
                    });
                  }}
                  className="rounded-md bg-[var(--bg-success)] px-3 py-1 text-xs font-medium text-[var(--text-on-success)] hover:bg-[var(--bg-success-hover)]"
                >
                  Copy shop link
                </button>
              </div>

              {/* Manage panel: extend, suspend, trial */}
              {showActionsFor === shop.id && (
                <div className="mt-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3 space-y-3">
                  <h3 className="text-sm font-semibold">Manage Subscription — {shop.name}</h3>

                  {/* Extend */}
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="text-[11px] text-[var(--text-faint)]">Extend by (days)</label>
                      <input
                        type="number"
                        value={extendDays}
                        onChange={(e) => setExtendDays(e.target.value)}
                        className="mt-0.5 w-24 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                      />
                    </div>
                    <button
                      onClick={() => doExtend(shop)}
                      className="rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-xs font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-success-hover)]"
                    >
                      Extend
                    </button>
                    <span className="text-[11px] text-[var(--text-faint)] py-1.5">
                      Quick: <button onClick={() => setExtendDays('7')} className="underline">7d</button> ·
                      <button onClick={() => setExtendDays('15')} className="underline ml-1">15d</button> ·
                      <button onClick={() => setExtendDays('30')} className="underline ml-1">30d</button>
                    </span>
                  </div>

                  {/* Set trial */}
                  <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border-card)] pt-2">
                    <div>
                      <label className="text-[11px] text-[var(--text-faint)]">Set trial end date</label>
                      <input
                        type="date"
                        value={trialDate}
                        onChange={(e) => setTrialDate(e.target.value)}
                        className="mt-0.5 rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                      />
                    </div>
                    <button
                      onClick={() => doSetTrial(shop)}
                      className="rounded-md bg-[var(--bg-warning)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                    >
                      Set Trial
                    </button>
                  </div>

                  {/* Suspend / Unsuspend */}
                  <div className="flex gap-2 border-t border-[var(--border-card)] pt-2">
                    {shop.billing_status === 'suspended' ? (
                      <button
                        onClick={() => doUnsuspend(shop)}
                        className="rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-xs font-medium text-[var(--text-on-primary)]"
                      >
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => doSuspend(shop)}
                        className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                      >
                        Suspend Access
                      </button>
                    )}
                    <button
                      onClick={() => setShowActionsFor(null)}
                      className="rounded-md bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              {showPaymentFor === shop.id && (
                <PaymentForm
                  shop={shop}
                  plans={plans}
                  onSaved={() => { setShowPaymentFor(null); onReload(); }}
                  onCancel={() => setShowPaymentFor(null)}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---- Payment Form (inline) ---- */

function PaymentForm({ shop, plans, onSaved, onCancel }: {
  shop: Shop;
  plans: Plan[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [plan, setPlan] = useState(plans[0]?.id || 'single');
  const [amount, setAmount] = useState(String(plans[0]?.price || 15000));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(today);
  const [coversFrom, setCoversFrom] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const selectedPlan = plans.find((p) => p.id === plan);

  const coversTo = useMemo(() => {
    if (!selectedPlan) return today;
    const d = new Date(coversFrom);
    d.setMonth(d.getMonth() + selectedPlan.durationMonths);
    return d.toISOString().slice(0, 10);
  }, [coversFrom, selectedPlan]);

  const onPlanChange = (newPlan: string) => {
    setPlan(newPlan);
    const p = plans.find((pl) => pl.id === newPlan);
    if (p) setAmount(String(p.price));
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const r = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recordPayment',
          shopId: shop.id,
          amount: Number(amount),
          paymentMethod,
          paymentDate,
          plan,
          coversFrom,
          coversTo,
          notes,
        }),
      });
      const d = await r.json();
      if (d.error) { setErr(d.error); setSaving(false); return; }
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3 space-y-3">
      <h3 className="text-sm font-semibold">Record Subscription Payment — {shop.name}</h3>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-[11px] text-[var(--text-faint)]">Plan</label>
          <select
            value={plan}
            onChange={(e) => onPlanChange(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.label} — ₹{p.price.toLocaleString('en-IN')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[var(--text-faint)]">Amount (₹)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] text-[var(--text-faint)]">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[var(--text-faint)]">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] text-[var(--text-faint)]">Coverage From</label>
          <input
            type="date"
            value={coversFrom}
            onChange={(e) => setCoversFrom(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] text-[var(--text-faint)]">Coverage To (auto)</label>
          <input
            type="date"
            value={coversTo}
            readOnly
            className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-card-hover)] px-2 py-1 text-xs"
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-[var(--text-faint)]">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Receipt no, reference, etc."
          className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-[var(--bg-primary)] px-4 py-1.5 text-xs font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Payment'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md bg-[var(--bg-card)] px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---- Payments Tab ---- */

function PaymentsTab({ payments, fmtINR }: {
  payments: SubscriptionPayment[];
  fmtINR: (n: number) => string;
}) {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--bg-card)] p-4 text-center sm:p-8">
        <p className="text-sm text-[var(--text-faint)]">No subscription payments recorded yet.</p>
        <p className="text-xs text-[var(--text-faint)] mt-1">Go to the Shops tab to record a payment.</p>
      </div>
    );
  }

  const totalCash = payments.filter((p) => p.payment_method === 'cash').reduce((s, p) => s + p.amount, 0);
  const totalUpi = payments.filter((p) => p.payment_method === 'upi').reduce((s, p) => s + p.amount, 0);
  const totalOther = payments.filter((p) => !['cash', 'upi', 'extension'].includes(p.payment_method)).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-3">
      {/* Payment method breakdown */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[var(--bg-card)] p-3">
          <p className="text-[11px] text-[var(--text-faint)]">Cash</p>
          <p className="text-base font-bold text-[var(--text-primary)]">{fmtINR(totalCash)}</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] p-3">
          <p className="text-[11px] text-[var(--text-faint)]">UPI</p>
          <p className="text-base font-bold text-[var(--text-primary)]">{fmtINR(totalUpi)}</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] p-3">
          <p className="text-[11px] text-[var(--text-faint)]">Other</p>
          <p className="text-base font-bold text-[var(--text-primary)]">{fmtINR(totalOther)}</p>
        </div>
      </div>

      {/* Export button */}
      <div className="flex justify-end">
        <a
          href="/api/admin/subscriptions?export=csv"
          className="rounded-md bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
        >
          ⬇ Export CSV
        </a>
      </div>

      {/* Payments table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border-light)]">
        <table className="w-full text-xs">
          <thead className="bg-[var(--bg-card)]">
            <tr className="text-left text-[var(--text-faint)]">
              <th className="p-2">Date</th>
              <th className="p-2">Shop</th>
              <th className="p-2">Plan</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2">Method</th>
              <th className="p-2">Coverage</th>
              <th className="p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border-card)]">
                <td className="p-2 whitespace-nowrap">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                <td className="p-2 font-medium">{p.shop_name}</td>
                <td className="p-2 capitalize">{p.plan}</td>
                <td className="p-2 text-right font-semibold">{p.amount > 0 ? fmtINR(p.amount) : '—'}</td>
                <td className="p-2 capitalize">{p.payment_method}</td>
                <td className="p-2 whitespace-nowrap text-[var(--text-faint)]">
                  {p.covers_from} → {p.covers_to}
                </td>
                <td className="p-2 text-[var(--text-faint)]">{p.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- Pricing Tab ---- */

function PricingTab({ plans, onReload }: { plans: Plan[]; onReload: () => void }) {
  const [editablePlans, setEditablePlans] = useState<Plan[]>(plans);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setEditablePlans(plans); }, [plans]);

  const updatePlan = (idx: number, field: keyof Plan, value: string | number) => {
    setEditablePlans((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const addPlan = () => {
    setEditablePlans((prev) => [...prev, {
      id: `plan_${Date.now()}`,
      label: 'New Plan',
      price: 10000,
      durationMonths: 12,
      maxShops: 1,
    }]);
  };

  const removePlan = (idx: number) => {
    setEditablePlans((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updatePlans', plans: editablePlans }),
      });
      const d = await r.json();
      if (!d.error) {
        setSaved(true);
        onReload();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Pricing Plans</h2>
          <p className="text-xs text-[var(--text-faint)]">Configure subscription tiers. Changes apply to all shops.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addPlan}
            className="rounded-md bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
          >
            + Add Plan
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-[var(--bg-primary)] px-4 py-1.5 text-xs font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Plans'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {editablePlans.map((p, idx) => (
          <div key={idx} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-[11px] text-[var(--text-faint)]">Plan ID</label>
                <input
                  type="text"
                  value={p.id}
                  onChange={(e) => updatePlan(idx, 'id', e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-faint)]">Label</label>
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => updatePlan(idx, 'label', e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-faint)]">Price (₹/year)</label>
                <input
                  type="number"
                  value={p.price}
                  onChange={(e) => updatePlan(idx, 'price', Number(e.target.value))}
                  className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-faint)]">Max Shops</label>
                <input
                  type="number"
                  value={p.maxShops}
                  onChange={(e) => updatePlan(idx, 'maxShops', Number(e.target.value))}
                  className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-faint)]">Duration (months)</label>
                <input
                  type="number"
                  value={p.durationMonths}
                  onChange={(e) => updatePlan(idx, 'durationMonths', Number(e.target.value))}
                  className="mt-0.5 w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                />
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => removePlan(idx)}
                className="text-xs text-red-500 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Sourcing Tab ---- */

type SourcingSection = 'overview' | 'vegetables' | 'contacts' | 'officers' | 'apps' | 'seasonal' | 'action';

const PROFITABLE_VEG = [
  { name: 'French Beans', modal: '₹5,500', range: '₹3,000-7,000', shelf: '3-5 days', tier: 'high', note: 'Highest modal price. From Bangalore/Karnataka.' },
  { name: 'Green Chilli', modal: '₹4,000', range: '₹2,000-5,500', shelf: '4-7 days', tier: 'high', note: 'Daily demand from every hotel/household. AP largest producer.' },
  { name: 'Carrot', modal: '₹3,000', range: '₹500-4,000', shelf: '1-2 weeks', tier: 'high', note: 'Good storage life. From Indore (MP) & Bidar (Karnataka).' },
  { name: 'Parval (Pointed Gourd)', modal: '₹3,600', range: '₹3,000-4,000', shelf: '4-6 days', tier: 'high', note: 'From Kolkata. Premium, less competition.' },
  { name: 'Drumstick', modal: '₹2,000', range: '₹1,000-3,000', shelf: '2-3 days', tier: 'high', note: 'From Vijayawada, Erode (TN), Nalgonda.' },
  { name: 'Brinjal', modal: '₹2,500', range: '₹1,000-3,000', shelf: '3-7 days', tier: 'high', note: 'Steady year-round demand. Local + AP/Karnataka.' },
  { name: 'Beetroot', modal: '₹2,000', range: '₹500-2,700', shelf: '1-2 weeks', tier: 'high', note: 'Good storage life, steady demand.' },
  { name: 'Cauliflower', modal: '₹1,200', range: '₹500-1,500', shelf: '3-5 days', tier: 'high', note: 'Winter crop, high seasonal demand.' },
  { name: 'Bhendi (Okra)', modal: '₹1,200', range: '₹800-1,500', shelf: '2-3 days', tier: 'high', note: 'Year-round demand. Nalgonda, Kurnool, Anantapur.' },
  { name: 'Tomato', modal: '₹1,000', range: '₹400-1,200', shelf: '3-5 days', tier: 'high', note: 'Highest volume. Price swings ₹400-₹4,000. Madanapalli (AP).' },
];

const DURABLE_VEG = [
  { name: 'Garlic', shelf: '3-5 months', note: 'Keep dry, ventilated. Avoid 40-55°F (sprouting).' },
  { name: 'Onion', shelf: '1-2 months', note: 'Mesh bags, dry, ventilated. Never with potatoes.' },
  { name: 'Pumpkin', shelf: '2-3 months', note: 'Hard skin varieties store longest. Keep dry.' },
  { name: 'Potato', shelf: '4-8 weeks', note: 'Cool, dark. Never with onions (ethylene). Keep dark.' },
  { name: 'Sweet Potato', shelf: '4-7 weeks', note: 'Store warm (55-60°F). Chilling injury below 50°F.' },
  { name: 'Yam (Ratalu)', shelf: '2-4 weeks', note: 'Store cool, dry.' },
  { name: 'Ginger', shelf: '2-3 weeks', note: 'Cool, dry place.' },
  { name: 'Beetroot', shelf: '1-2 weeks', note: 'Remove leafy tops first.' },
  { name: 'Carrot', shelf: '1-2 weeks', note: 'Remove tops. Keep cool.' },
];

const FARMER_CONTACTS = [
  { name: 'Balakrishna Reddy', phone: '9849875433', location: 'Madanapalli, Kalikiri (AP)', crop: 'Tomato', source: 'KisanMandi listing' },
  { name: 'FromFarmer (Nashik Onion)', phone: '+91-84590 70028', location: 'Nashik, Maharashtra', crop: 'Onion', source: 'fromfarmer.org — 50+ markets, 1-100 tons' },
  { name: 'Krushivruddhi Agro FPC', phone: '08071794312', location: 'Nashik, Maharashtra', crop: 'Onion', source: 'Farmer-owned company, bulk supply' },
  { name: 'Nitin Agro Product', phone: '+91-98605 38335', location: 'Deola, Nashik', crop: 'Onion', source: 'Sources from Nashik, Pune, Karnataka' },
  { name: 'Nashik Fruit & Vegetable', phone: '+91-70839 60822', location: 'Lasalgaon, Nashik', crop: 'Onion', source: 'Lasalgaon & Pimpalgaon belt' },
  { name: 'Yeshswini Agro (FPC)', phone: '9881998112', location: 'Boramani, Solapur', crop: 'Onion', source: 'Maharashtra FPC' },
  { name: 'Green Horizon FPC', phone: '9423784068', location: 'Pandharpur, Solapur', crop: 'Onion', source: 'Maharashtra FPC' },
  { name: 'Yedshikar Onion Traders', phone: '9595585777', location: 'Kurdwadi/Madha, Solapur', crop: 'Onion', source: 'MSAMB listing' },
  { name: 'S. Srinivas Rao', phone: '9823113248', location: 'Solapur', crop: 'Onion', source: '8 trucks weekly' },
  { name: 'Guntur Red Chillies', phone: '+91-83413 39975', location: 'Guntur, AP', crop: 'Chilli (dry red)', source: 'Beside Mirchi Yard, Guntur' },
  { name: 'Sri Sai Durga Chillies', phone: '(website)', location: 'Arundelpet, Guntur', crop: 'Chilli (341 variety)', source: 'Large exporter, sources from farmers' },
  { name: 'Jeevan Jyothi Traders', phone: '(IndianYellowPages)', location: 'Giddalur, Prakasam', crop: 'Chilli (Teja)', source: 'Dry Red Chilli Teja, Guntur Red' },
  { name: 'Sreenivasulu Chilli Traders', phone: '(IndianYellowPages)', location: 'Nandyal District', crop: 'Chilli (No.5)', source: '45 quintals stock, farm-direct' },
  { name: 'Dhanuka Farms', phone: '(B2B form)', location: 'Turkapally, Telangana', crop: 'Various', source: 'Direct supply to Hyderabad/Secunderabad' },
  { name: "Nature's Pick Organic", phone: '+91-70930 40909', location: 'Hyderabad & AP', crop: 'Organic vegetables', source: 'Organic certified' },
];

const GOVT_OFFICERS = [
  { role: 'Telangana MAO (Mandal Agriculture Officers)', contact: 'rythubharosa.telangana.gov.in/ContactList.aspx?Role=MAO', note: 'Every mandal has an MAO with phone number. They know all farmers in their area.' },
  { role: 'Telangana Horticulture Officers (DHSO)', contact: 'horticulture.tg.nic.in', note: 'District-level vegetable/horticulture officers. Example: Nizamabad DHSO 8977713968, Adilabad 8977713928.' },
  { role: 'AP Commissionerate of Agriculture', contact: '88866 14028', note: 'Guntur. Can direct you to district officers in Madanapalli, Anantapur, Kurnool.' },
  { role: 'AP Commissioner of Horticulture', contact: '7330741111', note: 'Guntur. For horticulture/vegetable farmer connections.' },
  { role: 'Telangana Agriculture Director', contact: '040-23232107', note: 'State-level agriculture department.' },
];

const USEFUL_LINKS = [
  { label: 'Bharat FPO Finder', url: 'https://bharatfpofinder.nafpo.in', desc: 'Search 40,000+ verified FPOs by state, district, commodity. Free.' },
  { label: 'SFAC FPO List', url: 'https://sfacindia.com', desc: 'Government FPO lists with contact details, state-wise.' },
  { label: 'APEDA Farmer Connect', url: 'https://farmerconnect.apeda.gov.in/FPO/directory.aspx', desc: 'Government FPO/FPC/Cooperative directory.' },
  { label: 'eNAM Portal', url: 'https://enam.gov.in', desc: 'Register as commission agent for national online trading. Free.' },
  { label: 'Bowenpally APMC Rates', url: 'https://mandipulse.com/mandi/telangana-hyderabad-bowenpally-apmc', desc: 'Daily Bowenpally mandi prices for all commodities.' },
  { label: 'Agriplus Bowenpally Rates', url: 'https://www.agriplus.in/prices/all/telangana/hyderabad/bowenpally-apmc', desc: 'Alternative source for Bowenpally daily rates.' },
  { label: 'MandiAgent Directory', url: 'https://mandiagent.com', desc: 'Directory of canvassers/suppliers with phone numbers.' },
  { label: 'Bijak Mandi App', url: 'https://play.google.com/store/apps/details?id=com.bedwal.bijak.mvp', desc: 'Connect with 1 lakh+ verified traders/farmers. 100% payment guarantee.' },
  { label: 'KisanMandi.com', url: 'https://kisanmandi.com', desc: 'Free online agri market. Farmers list produce directly.' },
  { label: 'KISAN Connect App', url: 'https://kisan.app/web/org/connect.html', desc: 'Connect with farmers via video/phone/WhatsApp.' },
  { label: 'KisanSabha', url: 'https://www.kisansabha.in', desc: 'Farmers connect directly with dealers/buyers. Free app.' },
  { label: 'WhatsApp Farmer Groups', url: 'https://grouplink.com.in/best-lasalgaon-onion-market-whatsapp-group-links/', desc: '1190+ agri WhatsApp groups including Madanapalli Tomato, Green Chilli, Karnataka Vegetables.' },
  { label: 'Agri WhatsApp Groups', url: 'https://groupslinky.com/agriculture-whatsapp-group-links/', desc: 'Telangana Farmers group + other agriculture groups.' },
];

const SOURCING_MAP = [
  { region: 'Telangana (Local)', items: [
    { veg: 'Potato', source: 'Zaheerabad, Vikarabad, Tandur' },
    { veg: 'Tomato', source: 'Rangareddy, Sadashivapet, Adilabad, Nizamabad' },
    { veg: 'Brinjal', source: 'Shameerpet, Chevella, Rangareddy, Zaheerabad' },
    { veg: 'Bhendi (Okra)', source: 'Nalgonda' },
    { veg: 'Green Chillies', source: 'Nalgonda, Rangareddy' },
    { veg: 'French Beans', source: 'Ontimamidi, Rangareddy, Gajwel' },
    { veg: 'Leafy Vegetables', source: 'Rayapuram, Kethepally (Nalgonda) — 110 farmers, ₹2Cr/yr' },
    { veg: 'Drumsticks', source: 'Nalgonda, Gadwal' },
  ]},
  { region: 'Andhra Pradesh', items: [
    { veg: 'Tomato', source: 'Madanapalli (Annamayya) — Asia\'s largest tomato belt, 25,000 hectares' },
    { veg: 'Brinjal', source: 'Kurnool, Anantapur, Prakasam, Guntur' },
    { veg: 'Green Chillies', source: 'Anantapur, Kurnool, Prakasam, Guntur' },
    { veg: 'Drumsticks', source: 'Vijayawada, Hanuman Junction' },
    { veg: 'Bottle Gourd, Cluster Beans', source: 'Various AP centres' },
    { veg: 'Banana, Radish', source: 'Various AP centres' },
  ]},
  { region: 'Karnataka', items: [
    { veg: 'Tomato (hybrid)', source: 'Bangalore, Chikballapur' },
    { veg: 'Green Chillies (bold)', source: 'Belgaum, Bangalore' },
    { veg: 'Cauliflower, Carrot, Capsicum', source: 'Bangalore' },
    { veg: 'French Beans', source: 'Bangalore, Chikballapur' },
    { veg: 'Onion', source: 'Karnataka (major supplier)' },
  ]},
  { region: 'Maharashtra', items: [
    { veg: 'Onion', source: 'Solapur (major), Nashik/Lasalgaon (Asia\'s largest onion market)' },
    { veg: 'Capsicum', source: 'Sangli' },
  ]},
  { region: 'Other States', items: [
    { veg: 'Potato', source: 'Indore (MP), Agra (UP), Bidar (Karnataka)' },
    { veg: 'Green Peas', source: 'Jodhpur (Rajasthan)' },
    { veg: 'Parwal', source: 'Kolkata (West Bengal)' },
    { veg: 'Amla', source: 'Jaipur, Jodhpur (Rajasthan)' },
  ]},
];

const SEASONAL_DATA = [
  { season: 'Kharif (Monsoon)', months: 'Jun-Oct', crops: 'Tomato, Bhendi, Brinjal, Green Chilli, Bottle Gourd, Ridge Gourd, Leafy Greens' },
  { season: 'Rabi (Winter)', months: 'Nov-Feb', crops: 'Cauliflower, Cabbage, Carrot, Peas, Tomato (peak), Potato, Onion (harvest), Green Chilli' },
  { season: 'Summer', months: 'Mar-May', crops: 'Onion (storage), Potato, Drumstick, Bitter Gourd, Watermelon, Muskmelon, Bhendi' },
];

const PRICE_PATTERNS = [
  { crop: 'Tomato', pattern: 'Peaks Jun-Sep (₹2,700-4,000/qtl), drops Nov-Feb. Buy low in winter, sell high in monsoon.' },
  { crop: 'Onion', pattern: 'Peaks Aug-Oct (₹2,000-4,000/qtl), drops Mar-May (harvest). Storage crop — buy in harvest, hold for peak.' },
  { crop: 'Green Chilli', pattern: 'Relatively stable ₹2,000-5,500/qtl year-round. Always in demand.' },
  { crop: 'Potato', pattern: 'Stable ₹400-1,300/qtl. Low margin but safe — always sells.' },
];

const ACTION_PLAN = [
  { day: 'Day 1-2', task: 'Call 3-5 Horticulture Officers in target districts (Nalgonda, Rangareddy, Sangareddy for local; Kurnool/Anantapur for AP). Ask for FPO contacts.' },
  { day: 'Day 3', task: 'Download Bijak Mandi app, register as buyer/commission agent, browse supplier listings.' },
  { day: 'Day 4-5', task: 'Join 3-5 WhatsApp farmer groups. Post your requirement with phone number.' },
  { day: 'Weekend', task: 'Visit Bowenpally at 4 AM. Talk to 10 farmers unloading produce. Get their numbers. Offer transparent billing via RVC Ledger.' },
  { day: 'Next week', task: 'Visit one source APMC in person — Madanapalli (tomato) or Nalgonda (local vegetables). Talk to farmers directly.' },
];

function SourcingTab() {
  const [section, setSection] = useState<SourcingSection>('overview');

  const sections: { key: SourcingSection; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'vegetables', label: 'Profitable Vegetables' },
    { key: 'contacts', label: 'Farmer Contacts' },
    { key: 'officers', label: 'Govt Officers' },
    { key: 'apps', label: 'Apps & Links' },
    { key: 'seasonal', label: 'Seasonal Calendar' },
    { key: 'action', label: 'Action Plan' },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-section tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border-light)]">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              section === s.key
                ? 'border-b-2 border-[var(--bg-primary)] text-[var(--text-primary)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'overview' && <OverviewSection />}
      {section === 'vegetables' && <VegetablesSection />}
      {section === 'contacts' && <ContactsSection />}
      {section === 'officers' && <OfficersSection />}
      {section === 'apps' && <AppsSection />}
      {section === 'seasonal' && <SeasonalSection />}
      {section === 'action' && <ActionSection />}
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Vegetable Sourcing & Profitability Research</h2>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Telangana produces only 32% of its vegetable needs. Bowenpally APMC alone imported
          ₹1,572 crore worth of vegetables from other states in 2025-26. There is massive,
          consistent demand — the gap is on the supply side. Your job is to find farmers who
          can send you more produce.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--bg-primary)]">High Margin</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            French Beans (₹5,500/qtl), Green Chilli (₹4,000), Parval (₹3,600), Carrot (₹3,000)
          </p>
          <p className="mt-2 text-[11px] text-[var(--text-faint)]">Higher price = more commission income (5-8% of sale value)</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--bg-success)]">Durable (Safe to Store)</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Garlic (3-5 months), Onion (1-2 months), Potato (4-8 weeks), Pumpkin (2-3 months)
          </p>
          <p className="mt-2 text-[11px] text-[var(--text-faint)]">If unsold today, hold overnight — no waste</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--bg-warning)]">Perishable (Sell Same Day)</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Leafy greens (1-2 days), Bhendi (2-3 days), Tomato (3-5 days), Drumstick (2-3 days)
          </p>
          <p className="mt-2 text-[11px] text-[var(--text-faint)]">Must sell same day or lose money</p>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h3 className="text-sm font-semibold">Recommended Mix</h3>
        <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
          <p><span className="font-semibold text-[var(--text-primary)]">60% Daily perishables:</span> Tomato, Green Chilli, Bhendi, Brinjal — high turnover, daily demand, good commission</p>
          <p><span className="font-semibold text-[var(--text-primary)]">30% Durable staples:</span> Onion, Potato, Garlic — safe to hold overnight, steady demand, lower margin but zero waste risk</p>
          <p><span className="font-semibold text-[var(--text-primary)]">10% Premium vegetables:</span> French Beans, Carrot, Parval, Drumstick — higher margin, lower volume, target hotel/restaurant buyers</p>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h3 className="text-sm font-semibold">Sourcing Map — Where Bowenpally Gets Vegetables</h3>
        <div className="mt-3 space-y-3">
          {SOURCING_MAP.map((region) => (
            <div key={region.region}>
              <p className="text-xs font-semibold text-[var(--text-secondary)]">{region.region}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {region.items.map((item) => (
                  <span key={item.veg} className="rounded-md bg-[var(--bg-input)] px-2 py-1 text-[11px] text-[var(--text-muted)]" title={item.source}>
                    {item.veg} <span className="text-[var(--text-faint)]">— {item.source}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VegetablesSection() {
  return (
    <div className="space-y-4">
      {/* High margin vegetables */}
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Tier 1 — High Margin, High Demand</h2>
        <p className="text-[11px] text-[var(--text-faint)] mt-1">Prices are Bowenpally APMC modal rates (per quintal), Aug 2026. Verify against daily market observation.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-light)] text-left text-[var(--text-faint)]">
                <th className="py-2 pr-3">Vegetable</th>
                <th className="py-2 pr-3 text-right">Modal Price</th>
                <th className="py-2 pr-3">Price Range</th>
                <th className="py-2 pr-3">Shelf Life</th>
                <th className="py-2 pr-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {PROFITABLE_VEG.map((v) => (
                <tr key={v.name} className="border-b border-[var(--border-card)]">
                  <td className="py-2 pr-3 font-medium">{v.name}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-[var(--bg-primary)]">{v.modal}/qtl</td>
                  <td className="py-2 pr-3 text-[var(--text-muted)]">{v.range}</td>
                  <td className="py-2 pr-3 text-[var(--text-muted)]">{v.shelf}</td>
                  <td className="py-2 pr-3 text-[var(--text-faint)]">{v.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Durable vegetables */}
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Tier 2 — Durable (Safe to Store Overnight)</h2>
        <p className="text-[11px] text-[var(--text-faint)] mt-1">If they don&apos;t sell today, you can hold them. No cold storage needed for most.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-light)] text-left text-[var(--text-faint)]">
                <th className="py-2 pr-3">Vegetable</th>
                <th className="py-2 pr-3">Shelf Life (ambient)</th>
                <th className="py-2 pr-3">Storage Notes</th>
              </tr>
            </thead>
            <tbody>
              {DURABLE_VEG.map((v) => (
                <tr key={v.name} className="border-b border-[var(--border-card)]">
                  <td className="py-2 pr-3 font-medium">{v.name}</td>
                  <td className="py-2 pr-3 text-[var(--text-success)] font-semibold">{v.shelf}</td>
                  <td className="py-2 pr-3 text-[var(--text-faint)]">{v.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price patterns */}
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Price Volatility Patterns</h2>
        <div className="mt-3 space-y-2">
          {PRICE_PATTERNS.map((p) => (
            <div key={p.crop} className="rounded-lg bg-[var(--bg-input)] p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">{p.crop}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{p.pattern}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactsSection() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Farmer / Trader / FPO Contacts</h2>
        <p className="text-[11px] text-[var(--text-faint)] mt-1">
          These are publicly listed numbers from business directories and government listings.
          Call to verify before relying on them. Some may be traders rather than direct farmers.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-light)] text-left text-[var(--text-faint)]">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Location</th>
                <th className="py-2 pr-3">Crop</th>
                <th className="py-2 pr-3">Source / Notes</th>
              </tr>
            </thead>
            <tbody>
              {FARMER_CONTACTS.map((c) => (
                <tr key={c.name} className="border-b border-[var(--border-card)] hover:bg-[var(--bg-card-hover)]">
                  <td className="py-2 pr-3 font-medium">{c.name}</td>
                  <td className="py-2 pr-3">
                    {c.phone.startsWith('+91') || c.phone.match(/^\d/) ? (
                      <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="text-[var(--bg-primary)] hover:underline">{c.phone}</a>
                    ) : (
                      <span className="text-[var(--text-muted)]">{c.phone}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-[var(--text-muted)]">{c.location}</td>
                  <td className="py-2 pr-3"><span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px]">{c.crop}</span></td>
                  <td className="py-2 pr-3 text-[var(--text-faint)]">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-input)] p-4">
        <h3 className="text-sm font-semibold">How to Approach Farmers</h3>
        <div className="mt-2 rounded-lg bg-[var(--bg-card)] p-3">
          <p className="text-[11px] font-semibold text-[var(--text-faint)]">Phone/WhatsApp Script:</p>
          <p className="mt-1 text-xs text-[var(--text-muted)] italic">
            &quot;Namaste, main Bowenpally mandi se bol raha hoon. Hum aapki sabzi market mein
            bech kar commission par kaam karte hain. Agar aap tomato/chilli/bhendi ya koi bhi
            sabzi ugate hain, toh hum aapke liye market mein bech sakte hain. Aapko transport ka
            kharcha aapko uthana padega, baaki selling aur payment hum handle karenge. Hum par
            commission 6% lagega. Agar interest hai toh sample bhej kar dekhein, achha rate milega.&quot;
          </p>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
          <p><span className="font-semibold">1.</span> Call FPOs first — one call = access to hundreds of farmers</p>
          <p><span className="font-semibold">2.</span> Visit APMC offices in source districts — they have farmer lists</p>
          <p><span className="font-semibold">3.</span> Use eNAM portal — register as commission agent for national access</p>
          <p><span className="font-semibold">4.</span> Join WhatsApp farmer groups in source districts</p>
          <p><span className="font-semibold">5.</span> Start with one vegetable — build trust, then expand</p>
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-input)] p-4">
        <h3 className="text-sm font-semibold">What Farmers Care About</h3>
        <div className="mt-2 space-y-1.5 text-xs text-[var(--text-muted)]">
          <p><span className="font-semibold text-[var(--text-primary)]">1. Timely payment</span> — most important. Pay within 1-2 days of sale.</p>
          <p><span className="font-semibold text-[var(--text-primary)]">2. Transparent billing</span> — show them the mandi rate and commission deduction. Your RVC Ledger app helps here.</p>
          <p><span className="font-semibold text-[var(--text-primary)]">3. No exploitation</span> — don&apos;t underreport rates.</p>
          <p><span className="font-semibold text-[var(--text-primary)]">4. Consistent demand</span> — they want to know you&apos;ll take their produce every time.</p>
          <p><span className="font-semibold text-[var(--text-primary)]">5. Fair grading</span> — don&apos;t reject produce unfairly to negotiate lower prices.</p>
        </div>
      </div>
    </div>
  );
}

function OfficersSection() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Government Agriculture Officers</h2>
        <p className="text-[11px] text-[var(--text-faint)] mt-1">
          Best method to find farmers. These officers know every farmer in their area and can
          connect you with FPOs and active vegetable farmers.
        </p>
        <div className="mt-3 space-y-2">
          {GOVT_OFFICERS.map((o) => (
            <div key={o.role} className="rounded-lg bg-[var(--bg-input)] p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">{o.role}</p>
              <p className="mt-1 text-xs">
                <span className="text-[var(--text-faint)]">Contact: </span>
                {o.contact.match(/^\d/) ? (
                  <a href={`tel:${o.contact}`} className="text-[var(--bg-primary)] hover:underline">{o.contact}</a>
                ) : (
                  <a href={o.contact.startsWith('http') ? o.contact : `https://${o.contact}`} target="_blank" rel="noopener noreferrer" className="text-[var(--bg-primary)] hover:underline">
                    {o.contact}
                  </a>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{o.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h3 className="text-sm font-semibold">How to Use This</h3>
        <div className="mt-2 space-y-1.5 text-xs text-[var(--text-muted)]">
          <p><span className="font-semibold">1.</span> Call the MAO or DHSO of the district you want to source from</p>
          <p><span className="font-semibold">2.</span> Tell them you&apos;re a licensed commission agent at Bowenpally APMC</p>
          <p><span className="font-semibold">3.</span> Ask them to connect you with FPOs or active vegetable farmers in their mandal</p>
          <p><span className="font-semibold">4.</span> These officers maintain farmer lists and can arrange introductions</p>
        </div>
      </div>
    </div>
  );
}

function AppsSection() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Useful Websites, Apps & Links</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {USEFUL_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-[var(--bg-input)] p-3 hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <p className="text-xs font-semibold text-[var(--bg-primary)]">{link.label}</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{link.desc}</p>
              <p className="mt-1 text-[10px] text-[var(--text-faint)] truncate">{link.url}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h3 className="text-sm font-semibold">eNAM Registration (Online Mandi)</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          National online trading platform connecting 1,000+ APMC mandis across 18 states.
          Register free as a commission agent to receive online bids from buyers across India.
        </p>
        <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
          <p><span className="font-semibold">1.</span> Visit <a href="https://enam.gov.in" target="_blank" rel="noopener noreferrer" className="text-[var(--bg-primary)] hover:underline">enam.gov.in</a></p>
          <p><span className="font-semibold">2.</span> Select Registration Type as &quot;Trader&quot; or &quot;Commission Agent&quot;</p>
          <p><span className="font-semibold">3.</span> Select Bowenpally APMC as your mandi</p>
          <p><span className="font-semibold">4.</span> Upload: photo, Aadhaar, bank details, mandi license</p>
          <p><span className="font-semibold">5.</span> Get login ID via email after APMC approval</p>
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-faint)]">
          Benefits: more buyers = better prices, online payment via RTGS/NEFT/UPI, digital records for farmers.
        </p>
      </div>
    </div>
  );
}

function SeasonalSection() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Seasonal Calendar — What to Source When</h2>
        <div className="mt-3 space-y-2">
          {SEASONAL_DATA.map((s) => (
            <div key={s.season} className="rounded-lg bg-[var(--bg-input)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--text-primary)]">{s.season}</p>
                <span className="rounded bg-[var(--bg-card)] px-2 py-0.5 text-[10px] text-[var(--text-faint)]">{s.months}</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{s.crops}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h3 className="text-sm font-semibold">Price Volatility Patterns</h3>
        <div className="mt-3 space-y-2">
          {PRICE_PATTERNS.map((p) => (
            <div key={p.crop} className="rounded-lg bg-[var(--bg-input)] p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">{p.crop}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{p.pattern}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionSection() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Action Plan — This Week</h2>
        <div className="mt-3 space-y-2">
          {ACTION_PLAN.map((item, i) => (
            <div key={i} className="flex gap-3 rounded-lg bg-[var(--bg-input)] p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-primary)] text-xs font-bold text-[var(--text-on-primary)]">
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">{item.day}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.task}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--bg-input)] p-4">
        <h3 className="text-sm font-semibold">Your Competitive Advantage</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Most commission agents don&apos;t give farmers proper records. Your RVC Ledger app
          generates printed pattis, shows exact sale rates, and tracks payments transparently.
          Use this to win farmers from other agents — offer them something they don&apos;t get elsewhere.
        </p>
      </div>
    </div>
  );
}
