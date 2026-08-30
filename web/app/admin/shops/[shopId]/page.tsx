'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type ShopData = {
  exportedAt: string;
  customers: any[];
  transactions: any[];
  billItems: any[];
  purchases: any[];
  purchaseItems: any[];
  suppliers: any[];
  supplierPayments: any[];
  wastage: any[];
  catalogItems: any[];
  catalogAliases: any[];
  expenses: any[];
};

type Tab = 'overview' | 'customers' | 'transactions' | 'purchases' | 'suppliers' | 'catalog';

export default function ShopDataPage() {
  const params = useParams();
  const router = useRouter();
  const shopId = params.shopId as string;
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    fetch(`/api/admin/shops/${shopId}/data`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [shopId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <BackButton onClick={() => router.push('/admin')} />
        <p className="py-10 text-center text-sm text-[var(--text-faint)]">Loading shop data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackButton onClick={() => router.push('/admin')} />
        <p className="py-10 text-center text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const fmtINR = (n: number | string) => `₹${Number(n).toLocaleString('en-IN')}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN');

  // Calculate totals
  const totalBilled = data.transactions.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
  const totalPaid = data.transactions.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
  const totalOutstanding = totalBilled - totalPaid;
  const totalPurchases = data.purchases.reduce((s, p) => s + Number(p.total || 0), 0);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'overview', label: 'Overview', count: 0 },
    { id: 'customers', label: 'Customers', count: data.customers.length },
    { id: 'transactions', label: 'Transactions', count: data.transactions.length },
    { id: 'purchases', label: 'Purchases', count: data.purchases.length },
    { id: 'suppliers', label: 'Suppliers', count: data.suppliers.length },
    { id: 'catalog', label: 'Catalog', count: data.catalogItems.length },
  ];

  return (
    <div className="space-y-4">
      <BackButton onClick={() => router.push('/admin')} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Customers" value={String(data.customers.length)} />
        <Card label="Transactions" value={String(data.transactions.length)} />
        <Card label="Total Billed" value={fmtINR(totalBilled)} />
        <Card label="Outstanding" value={fmtINR(totalOutstanding)} accent={totalOutstanding > 0 ? 'warn' : 'ok'} />
        <Card label="Total Received" value={fmtINR(totalPaid)} accent="ok" />
        <Card label="Suppliers" value={String(data.suppliers.length)} />
        <Card label="Total Purchases" value={fmtINR(totalPurchases)} />
        <Card label="Catalog Items" value={String(data.catalogItems.length)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-light)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-b-2 border-[var(--bg-primary)] text-[var(--text-primary)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.label}{t.count > 0 && <span className="ml-1 text-[10px] text-[var(--text-faint)]">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab data={data} fmtINR={fmtINR} fmtDate={fmtDate} />}
      {tab === 'customers' && <CustomersTab customers={data.customers} transactions={data.transactions} fmtINR={fmtINR} />}
      {tab === 'transactions' && <TransactionsTab transactions={data.transactions} billItems={data.billItems} fmtINR={fmtINR} fmtDate={fmtDate} />}
      {tab === 'purchases' && <PurchasesTab purchases={data.purchases} purchaseItems={data.purchaseItems} fmtINR={fmtINR} fmtDate={fmtDate} />}
      {tab === 'suppliers' && <SuppliersTab suppliers={data.suppliers} fmtDate={fmtDate} />}
      {tab === 'catalog' && <CatalogTab items={data.catalogItems} />}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-[var(--text-faint)] hover:text-[var(--text-secondary)]"
    >
      ← Back to Admin
    </button>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: 'ok' | 'warn' }) {
  const color = accent === 'ok' ? 'text-[var(--bg-success)]' : accent === 'warn' ? 'text-[var(--bg-warning)]' : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-xl bg-[var(--bg-card)] p-3">
      <p className="text-[11px] text-[var(--text-faint)]">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-faint)]">{message}</p>;
}

/* ---- Overview Tab ---- */

function OverviewTab({ data, fmtINR, fmtDate }: { data: ShopData; fmtINR: (n: number | string) => string; fmtDate: (d: string) => string }) {
  const totalBilled = data.transactions.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
  const totalPaid = data.transactions.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
  const totalOutstanding = totalBilled - totalPaid;
  const totalPurchases = data.purchases.reduce((s, p) => s + Number(p.total || 0), 0);

  // Top 5 customers by outstanding
  const customerBalances = data.customers.map((c) => {
    const txns = data.transactions.filter((t) => t.customer_id === c.id);
    const billed = txns.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
    const paid = txns.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
    return { name: c.name, phone: c.phone, outstanding: billed - paid, txnCount: txns.length };
  }).sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);

  // Recent transactions
  const recentTxns = [...data.transactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Financial summary */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Financial Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-[var(--text-faint)]">Total Billed</p>
            <p className="text-base font-bold text-[var(--text-primary)]">{fmtINR(totalBilled)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-faint)]">Total Received</p>
            <p className="text-base font-bold text-[var(--bg-success)]">{fmtINR(totalPaid)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-faint)]">Outstanding</p>
            <p className="text-base font-bold text-[var(--bg-warning)]">{fmtINR(totalOutstanding)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-faint)]">Total Purchases</p>
            <p className="text-base font-bold text-[var(--text-primary)]">{fmtINR(totalPurchases)}</p>
          </div>
        </div>
      </section>

      {/* Top customers by outstanding */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Top Customers by Outstanding</h2>
        {customerBalances.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-faint)]">No customers.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-faint)]">
                  <th className="p-2">Name</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2 text-right">Txns</th>
                  <th className="p-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {customerBalances.map((c) => (
                  <tr key={c.name} className="border-t border-[var(--border-card)]">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2 text-[var(--text-faint)]">{c.phone || '—'}</td>
                    <td className="p-2 text-right">{c.txnCount}</td>
                    <td className={`p-2 text-right font-semibold ${c.outstanding > 0 ? 'text-[var(--bg-warning)]' : 'text-[var(--bg-success)]'}`}>
                      {fmtINR(c.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent transactions */}
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Recent Transactions</h2>
        {recentTxns.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-faint)]">No transactions.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-faint)]">
                  <th className="p-2">Date</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2 text-right">Billed</th>
                  <th className="p-2 text-right">Paid</th>
                  <th className="p-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {recentTxns.map((t) => {
                  const customer = data.customers.find((c) => c.id === t.customer_id);
                  return (
                    <tr key={t.id} className="border-t border-[var(--border-card)]">
                      <td className="p-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                      <td className="p-2 font-medium">{customer?.name || 'Unknown'}</td>
                      <td className="p-2 text-right">{Number(t.bill_amount) > 0 ? fmtINR(t.bill_amount) : '—'}</td>
                      <td className="p-2 text-right text-[var(--bg-success)]">{Number(t.amount_paid) > 0 ? fmtINR(t.amount_paid) : '—'}</td>
                      <td className="p-2 capitalize">{t.payment_method}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---- Customers Tab ---- */

function CustomersTab({ customers, transactions, fmtINR }: { customers: any[]; transactions: any[]; fmtINR: (n: number | string) => string }) {
  if (customers.length === 0) return <EmptyState message="No customers in this shop." />;

  const balances = customers.map((c) => {
    const txns = transactions.filter((t) => t.customer_id === c.id);
    const billed = txns.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
    const paid = txns.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
    return { ...c, outstanding: billed - paid, txnCount: txns.length };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-light)]">
      <table className="w-full text-xs">
        <thead className="bg-[var(--bg-card)]">
          <tr className="text-left text-[var(--text-faint)]">
            <th className="p-2">Name</th>
            <th className="p-2">Phone</th>
            <th className="p-2 text-right">Txns</th>
            <th className="p-2 text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((c) => (
            <tr key={c.id} className="border-t border-[var(--border-card)]">
              <td className="p-2 font-medium">{c.name}</td>
              <td className="p-2 text-[var(--text-faint)]">{c.phone || '—'}</td>
              <td className="p-2 text-right">{c.txnCount}</td>
              <td className={`p-2 text-right font-semibold ${c.outstanding > 0 ? 'text-[var(--bg-warning)]' : 'text-[var(--bg-success)]'}`}>
                {fmtINR(c.outstanding)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Transactions Tab ---- */

function TransactionsTab({ transactions, billItems, fmtINR, fmtDate }: {
  transactions: any[];
  billItems: any[];
  fmtINR: (n: number | string) => string;
  fmtDate: (d: string) => string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (transactions.length === 0) return <EmptyState message="No transactions in this shop." />;

  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-2">
      {sorted.map((t) => {
        const items = billItems.filter((b) => b.transaction_id === t.id);
        const isExpanded = expanded === t.id;
        return (
          <div key={t.id} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)]">
            <button
              onClick={() => setExpanded(isExpanded ? null : t.id)}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium">{fmtDate(t.date)}</span>
                <span className="text-xs text-[var(--text-faint)]">Bill: {t.bill_no || '—'}</span>
                <span className="text-xs capitalize text-[var(--text-faint)]">{t.payment_method}</span>
              </div>
              <div className="flex items-center gap-3">
                {Number(t.bill_amount) > 0 && <span className="text-xs font-semibold">{fmtINR(t.bill_amount)}</span>}
                {Number(t.amount_paid) > 0 && <span className="text-xs font-semibold text-[var(--bg-success)]">+{fmtINR(t.amount_paid)}</span>}
                <span className="text-[10px] text-[var(--text-faint)]">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>
            {isExpanded && (
              <div className="border-t border-[var(--border-card)] p-3">
                {t.notes && <p className="mb-2 text-[11px] text-[var(--text-faint)]">{t.notes}</p>}
                {items.length > 0 ? (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[var(--text-faint)]">
                        <th className="p-1">Item</th>
                        <th className="p-1">Qty</th>
                        <th className="p-1">Rate</th>
                        <th className="p-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((b) => (
                        <tr key={b.id} className="border-t border-[var(--border-card)]">
                          <td className="p-1">{b.confirmed_name || b.raw_text}{b.kind === 'charge' ? ' (charge)' : ''}</td>
                          <td className="p-1">{b.qty || '—'}</td>
                          <td className="p-1">{b.rate || '—'}</td>
                          <td className="p-1 text-right">{Number(b.amount) > 0 ? fmtINR(b.amount) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[11px] text-[var(--text-faint)]">No itemized bill items.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Purchases Tab ---- */

function PurchasesTab({ purchases, purchaseItems, fmtINR, fmtDate }: {
  purchases: any[];
  purchaseItems: any[];
  fmtINR: (n: number | string) => string;
  fmtDate: (d: string) => string;
}) {
  if (purchases.length === 0) return <EmptyState message="No purchases in this shop." />;

  return (
    <div className="space-y-2">
      {purchases.map((p) => {
        const items = purchaseItems.filter((i) => i.purchase_id === p.id);
        return (
          <div key={p.id} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium">{fmtDate(p.date)}</span>
                <span className="text-xs text-[var(--text-faint)]">{p.supplier}</span>
              </div>
              <span className="text-xs font-semibold">{fmtINR(p.total)}</span>
            </div>
            {items.length > 0 && (
              <div className="mt-2 border-t border-[var(--border-card)] pt-2">
                <table className="w-full text-[11px]">
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td className="p-1">{i.name}</td>
                        <td className="p-1">{i.qty}</td>
                        <td className="p-1 text-right">{fmtINR(i.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Suppliers Tab ---- */

function SuppliersTab({ suppliers, fmtDate }: { suppliers: any[]; fmtDate: (d: string) => string }) {
  if (suppliers.length === 0) return <EmptyState message="No suppliers in this shop." />;

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-light)]">
      <table className="w-full text-xs">
        <thead className="bg-[var(--bg-card)]">
          <tr className="text-left text-[var(--text-faint)]">
            <th className="p-2">Name</th>
            <th className="p-2">Phone</th>
            <th className="p-2">Added</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-t border-[var(--border-card)]">
              <td className="p-2 font-medium">{s.name}</td>
              <td className="p-2 text-[var(--text-faint)]">{s.phone || '—'}</td>
              <td className="p-2 text-[var(--text-faint)]">{fmtDate(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Catalog Tab ---- */

function CatalogTab({ items }: { items: any[] }) {
  if (items.length === 0) return <EmptyState message="No catalog items in this shop." />;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.id} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] p-3">
          <p className="text-sm font-medium">{i.name}</p>
          {i.default_sell_price && <p className="text-xs text-[var(--text-faint)] mt-0.5">Default price: ₹{i.default_sell_price}</p>}
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] ${i.active ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-card-hover)] text-[var(--text-faint)]'}`}>
            {i.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      ))}
    </div>
  );
}
