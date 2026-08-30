'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

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

type Tab = 'shops' | 'payments' | 'pricing';

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
          <p className="mt-2 text-sm text-[var(--text-faint)]">You need to log in as an administrator to view this page.</p>
          <button
            onClick={() => router.push('/admin/login')}
            className="mt-4 rounded-lg bg-[var(--bg-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
          >
            Login as Admin
          </button>
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
      <div className="flex gap-1 border-b border-[var(--border-light)]">
        {(['shops', 'payments', 'pricing'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-[var(--bg-primary)] text-[var(--text-primary)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t === 'shops' ? 'Shops' : t === 'payments' ? 'Payments' : 'Pricing'}
          </button>
        ))}
      </div>

      {tab === 'shops' && <ShopsTab shops={shops} plans={plans} onReload={load} fmtINR={fmtINR} />}
      {tab === 'payments' && <PaymentsTab payments={payments} fmtINR={fmtINR} />}
      {tab === 'pricing' && <PricingTab plans={plans} onReload={load} />}
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
                  href={`/api/admin/shops/${shop.id}/data`}
                  className="rounded-md bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]"
                >
                  View data
                </a>
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
      <div className="rounded-lg bg-[var(--bg-card)] p-8 text-center">
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
      <div className="grid grid-cols-3 gap-3">
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
