'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/app/components/I18nProvider';
import { formatCustomerName, localizeItem, getUiLang, t as translate, translatePaymentMethod } from '@/lib/i18n';

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

type Tab = 'overview' | 'customers' | 'transactions' | 'purchases' | 'suppliers' | 'catalog' | 'settings';

export default function ShopDataPage() {
  const params = useParams();
  const router = useRouter();
  const { lang } = useI18n();
  const uiLang = getUiLang(lang);
  const tr = (key: string) => translate(lang, key);
  const shopId = params.shopId as string;
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  const reloadData = () => {
    fetch(`/api/admin/shops/${shopId}/data`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        d.customers = (d.customers || []).map((c: any) => ({ ...c,
          englishName: c.english_name ?? c.englishName ?? null,
          teluguName: c.telugu_name ?? c.teluguName ?? null,
          hindiName: c.hindi_name ?? c.hindiName ?? null,
        }));
        d.catalogItems = (d.catalogItems || []).map((i: any) => ({ ...i,
          teluguName: i.telugu_name ?? i.teluguName ?? null,
          hindiName: i.hindi_name ?? i.hindiName ?? null,
        }));
        setData(d);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reloadData(); }, [shopId]);

  const manage = async (action: string, entityType: string, entityId?: string, data?: any) => {
    const res = await fetch('/api/admin/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, entityType, entityId, data, shopId }),
    });
    const r = await res.json();
    if (r.ok) { showToast('Done'); reloadData(); }
    else { showToast(r.error || 'Failed'); }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <BackButton onClick={() => router.push('/admin')} label={tr('backToAdmin')} />
        <p className="py-10 text-center text-sm text-[var(--text-faint)]">{tr('loadingShopData')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackButton onClick={() => router.push('/admin')} label={tr('backToAdmin')} />
        <p className="py-10 text-center text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const fmtINR = (n: number | string) => `₹${Number(n).toLocaleString('en-IN')}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN');

  const totalBilled = data.transactions.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
  const totalPaid = data.transactions.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
  const totalOutstanding = totalBilled - totalPaid;
  const totalPurchases = data.purchases.reduce((s, p) => s + Number(p.total || 0), 0);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'overview', label: tr('overview'), count: 0 },
    { id: 'customers', label: tr('customers'), count: data.customers.length },
    { id: 'transactions', label: tr('transactions'), count: data.transactions.length },
    { id: 'purchases', label: tr('purchases'), count: data.purchases.length },
    { id: 'suppliers', label: tr('suppliers'), count: data.suppliers.length },
    { id: 'catalog', label: tr('catalog'), count: data.catalogItems.length },
    { id: 'settings', label: tr('settings') || 'Settings', count: 0 },
  ];

  return (
    <div className="space-y-4">
      <BackButton onClick={() => router.push('/admin')} label={tr('backToAdmin')} />

      {toast && <div className="fixed top-4 right-4 z-50 rounded-lg bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-on-primary)] shadow-lg">{toast}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label={tr('customers')} value={String(data.customers.length)} />
        <Card label={tr('transactions')} value={String(data.transactions.length)} />
        <Card label={tr('totalBilled')} value={fmtINR(totalBilled)} />
        <Card label={tr('outstanding')} value={fmtINR(totalOutstanding)} accent={totalOutstanding > 0 ? 'warn' : 'ok'} />
        <Card label={tr('totalReceived')} value={fmtINR(totalPaid)} accent="ok" />
        <Card label={tr('suppliers')} value={String(data.suppliers.length)} />
        <Card label={tr('totalPurchases')} value={fmtINR(totalPurchases)} />
        <Card label={tr('catalogItems')} value={String(data.catalogItems.length)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-light)]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'border-b-2 border-[var(--bg-primary)] text-[var(--text-primary)]' : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'}`}>
            {t.label}{t.count > 0 && <span className="ml-1 text-[10px] text-[var(--text-faint)]">({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={data} fmtINR={fmtINR} fmtDate={fmtDate} uiLang={uiLang} tr={tr} lang={lang} />}
      {tab === 'customers' && <CustomersTab customers={data.customers} transactions={data.transactions} fmtINR={fmtINR} uiLang={uiLang} tr={tr} manage={manage} />}
      {tab === 'transactions' && <TransactionsTab transactions={data.transactions} billItems={data.billItems} customers={data.customers} fmtINR={fmtINR} fmtDate={fmtDate} uiLang={uiLang} tr={tr} lang={lang} manage={manage} />}
      {tab === 'purchases' && <PurchasesTab purchases={data.purchases} purchaseItems={data.purchaseItems} fmtINR={fmtINR} fmtDate={fmtDate} tr={tr} manage={manage} shopId={shopId} />}
      {tab === 'suppliers' && <SuppliersTab suppliers={data.suppliers} fmtDate={fmtDate} tr={tr} manage={manage} />}
      {tab === 'catalog' && <CatalogTab items={data.catalogItems} uiLang={uiLang} tr={tr} manage={manage} />}
      {tab === 'settings' && <SettingsTab shopId={shopId} tr={tr} manage={manage} router={router} />}
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-[var(--text-faint)] hover:text-[var(--text-secondary)]">{label}</button>;
}

function Card({ label, value, accent }: { label: string; value: string; accent?: 'ok' | 'warn' }) {
  const color = accent === 'ok' ? 'text-[var(--bg-success)]' : accent === 'warn' ? 'text-[var(--bg-warning)]' : 'text-[var(--text-primary)]';
  return <div className="rounded-xl bg-[var(--bg-card)] p-3"><p className="text-[11px] text-[var(--text-faint)]">{label}</p><p className={`text-lg font-bold ${color}`}>{value}</p></div>;
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-faint)]">{message}</p>;
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button onClick={() => setConfirming(true)} className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400">{label}</button>;
  }
  return (
    <span className="inline-flex gap-1">
      <button onClick={() => { onClick(); setConfirming(false); }} className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700">Confirm</button>
      <button onClick={() => setConfirming(false)} className="rounded bg-[var(--bg-card-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">Cancel</button>
    </span>
  );
}

/* ---- Overview Tab ---- */

function OverviewTab({ data, fmtINR, fmtDate, uiLang, tr, lang }: {
  data: ShopData; fmtINR: (n: number | string) => string; fmtDate: (d: string) => string; uiLang: string; tr: (k: string) => string; lang: any;
}) {
  const totalBilled = data.transactions.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
  const totalPaid = data.transactions.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
  const totalOutstanding = totalBilled - totalPaid;
  const totalPurchases = data.purchases.reduce((s, p) => s + Number(p.total || 0), 0);

  const customerBalances = data.customers.map((c) => {
    const txns = data.transactions.filter((t) => t.customer_id === c.id);
    const billed = txns.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
    const paid = txns.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
    return { ...c, displayName: formatCustomerName(c, uiLang), outstanding: billed - paid, txnCount: txns.length };
  }).sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);

  const recentTxns = [...data.transactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{tr('financialSummary')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="text-[11px] text-[var(--text-faint)]">{tr('totalBilled')}</p><p className="text-base font-bold text-[var(--text-primary)]">{fmtINR(totalBilled)}</p></div>
          <div><p className="text-[11px] text-[var(--text-faint)]">{tr('totalReceived')}</p><p className="text-base font-bold text-[var(--bg-success)]">{fmtINR(totalPaid)}</p></div>
          <div><p className="text-[11px] text-[var(--text-faint)]">{tr('outstanding')}</p><p className="text-base font-bold text-[var(--bg-warning)]">{fmtINR(totalOutstanding)}</p></div>
          <div><p className="text-[11px] text-[var(--text-faint)]">{tr('totalPurchases')}</p><p className="text-base font-bold text-[var(--text-primary)]">{fmtINR(totalPurchases)}</p></div>
        </div>
      </section>

      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{tr('topCustomersByOutstanding')}</h2>
        {customerBalances.length === 0 ? <p className="mt-2 text-xs text-[var(--text-faint)]">{tr('noCustomersInShop')}</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[var(--text-faint)]">
                <th className="p-2">{tr('customer')}</th><th className="p-2">{tr('phone')}</th><th className="p-2 text-right">{tr('txns')}</th><th className="p-2 text-right">{tr('outstanding')}</th>
              </tr></thead>
              <tbody>
                {customerBalances.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--border-card)]">
                    <td className="p-2 font-medium">{c.displayName}</td>
                    <td className="p-2 text-[var(--text-faint)]">{c.phone || '—'}</td>
                    <td className="p-2 text-right">{c.txnCount}</td>
                    <td className={`p-2 text-right font-semibold ${c.outstanding > 0 ? 'text-[var(--bg-warning)]' : 'text-[var(--bg-success)]'}`}>{fmtINR(c.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">{tr('recentTransactions')}</h2>
        {recentTxns.length === 0 ? <p className="mt-2 text-xs text-[var(--text-faint)]">{tr('noTransactionsInShop')}</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[var(--text-faint)]">
                <th className="p-2">{tr('date')}</th><th className="p-2">{tr('customer')}</th><th className="p-2 text-right">{tr('billed')}</th><th className="p-2 text-right">{tr('paid')}</th><th className="p-2">{tr('method')}</th>
              </tr></thead>
              <tbody>
                {recentTxns.map((t) => {
                  const customer = data.customers.find((c) => c.id === t.customer_id);
                  return (
                    <tr key={t.id} className="border-t border-[var(--border-card)]">
                      <td className="p-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                      <td className="p-2 font-medium">{customer ? formatCustomerName(customer, uiLang) : tr('unknown')}</td>
                      <td className="p-2 text-right">{Number(t.bill_amount) > 0 ? fmtINR(t.bill_amount) : '—'}</td>
                      <td className="p-2 text-right text-[var(--bg-success)]">{Number(t.amount_paid) > 0 ? fmtINR(t.amount_paid) : '—'}</td>
                      <td className="p-2">{translatePaymentMethod(t.payment_method, lang)}</td>
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

/* ---- Customers Tab (with edit/delete) ---- */

function CustomersTab({ customers, transactions, fmtINR, uiLang, tr, manage }: {
  customers: any[]; transactions: any[]; fmtINR: (n: number | string) => string; uiLang: string; tr: (k: string) => string;
  manage: (action: string, entityType: string, entityId?: string, data?: any) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  if (customers.length === 0) return <EmptyState message={tr('noCustomersInShop')} />;

  const balances = customers.map((c) => {
    const txns = transactions.filter((t) => t.customer_id === c.id);
    const billed = txns.reduce((s, t) => s + Number(t.bill_amount || 0), 0);
    const paid = txns.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
    return { ...c, displayName: formatCustomerName(c, uiLang), outstanding: billed - paid, txnCount: txns.length };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const startEdit = (c: any) => {
    setEditing(c.id);
    setEditForm({ name: c.name, phone: c.phone || '', englishName: c.englishName || c.english_name || '', teluguName: c.teluguName || c.telugu_name || '', hindiName: c.hindiName || c.hindi_name || '' });
  };

  const saveEdit = async (id: string) => {
    await manage('update', 'customer', id, editForm);
    setEditing(null);
  };

  return (
    <div className="space-y-2">
      {balances.map((c) => (
        <div key={c.id} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] p-3">
          {editing === c.id ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                <input value={editForm.englishName} onChange={(e) => setEditForm({ ...editForm, englishName: e.target.value })} placeholder="English name" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                <input value={editForm.teluguName} onChange={(e) => setEditForm({ ...editForm, teluguName: e.target.value })} placeholder="Telugu name" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                <input value={editForm.hindiName} onChange={(e) => setEditForm({ ...editForm, hindiName: e.target.value })} placeholder="Hindi name" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveEdit(c.id)} className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs font-medium text-[var(--text-on-primary)]">Save</button>
                <button onClick={() => setEditing(null)} className="rounded bg-[var(--bg-card-hover)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium">{c.displayName}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{c.phone || '—'} · {c.txnCount} {tr('txns')} · {fmtINR(c.outstanding)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(c)} className="rounded bg-[var(--bg-card-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">Edit</button>
                <DeleteButton label="Delete" onClick={() => manage('delete', 'customer', c.id)} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---- Transactions Tab (with edit/delete) ---- */

function TransactionsTab({ transactions, billItems, customers, fmtINR, fmtDate, uiLang, tr, lang, manage }: {
  transactions: any[]; billItems: any[]; customers: any[]; fmtINR: (n: number | string) => string; fmtDate: (d: string) => string; uiLang: string; tr: (k: string) => string; lang: any;
  manage: (action: string, entityType: string, entityId?: string, data?: any) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  if (transactions.length === 0) return <EmptyState message={tr('noTransactionsInShop')} />;

  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const startEdit = (t: any) => {
    setEditing(t.id);
    setEditForm({
      date: t.date ? new Date(t.date).toISOString().split('T')[0] : '',
      bill_no: t.bill_no || '',
      bill_amount: t.bill_amount || 0,
      amount_paid: t.amount_paid || 0,
      payment_method: t.payment_method || 'credit',
      notes: t.notes || '',
    });
  };

  const saveEdit = async (id: string) => {
    await manage('update', 'transaction', id, editForm);
    setEditing(null);
  };

  return (
    <div className="space-y-2">
      {sorted.map((t) => {
        const items = billItems.filter((b) => b.transaction_id === t.id);
        const isExpanded = expanded === t.id;
        const customer = customers.find((c) => c.id === t.customer_id);
        return (
          <div key={t.id} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)]">
            {editing === t.id ? (
              <div className="space-y-2 p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                  <input value={editForm.bill_no} onChange={(e) => setEditForm({ ...editForm, bill_no: e.target.value })} placeholder="Bill no" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                  <select value={editForm.payment_method} onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })} className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]">
                    <option value="credit">Credit</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank">Bank</option>
                  </select>
                  <input type="number" value={editForm.bill_amount} onChange={(e) => setEditForm({ ...editForm, bill_amount: Number(e.target.value) })} placeholder="Bill amount" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                  <input type="number" value={editForm.amount_paid} onChange={(e) => setEditForm({ ...editForm, amount_paid: Number(e.target.value) })} placeholder="Amount paid" className="rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                </div>
                <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes" className="w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(t.id)} className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs font-medium text-[var(--text-on-primary)]">Save</button>
                  <button onClick={() => setEditing(null)} className="rounded bg-[var(--bg-card-hover)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={() => setExpanded(isExpanded ? null : t.id)} className="flex w-full items-center justify-between p-3 text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium">{fmtDate(t.date)}</span>
                    <span className="text-xs text-[var(--text-faint)]">{customer ? formatCustomerName(customer, uiLang) : tr('unknown')}</span>
                    <span className="text-xs text-[var(--text-faint)]">{translatePaymentMethod(t.payment_method, lang)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {Number(t.bill_amount) > 0 && <span className="text-xs font-semibold">{fmtINR(t.bill_amount)}</span>}
                    {Number(t.amount_paid) > 0 && <span className="text-xs font-semibold text-[var(--bg-success)]">+{fmtINR(t.amount_paid)}</span>}
                    <span className="text-[10px] text-[var(--text-faint)]">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-[var(--border-card)] p-3">
                    <div className="mb-2 flex gap-2">
                      <button onClick={() => startEdit(t)} className="rounded bg-[var(--bg-card-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">Edit</button>
                      <DeleteButton label="Delete" onClick={() => manage('delete', 'transaction', t.id)} />
                    </div>
                    {t.notes && <p className="mb-2 text-[11px] text-[var(--text-faint)]">{t.notes}</p>}
                    {items.length > 0 ? (
                      <table className="w-full text-[11px]">
                        <thead><tr className="text-left text-[var(--text-faint)]">
                          <th className="p-1">{tr('item')}</th><th className="p-1">{tr('qty')}</th><th className="p-1">{tr('rate')}</th><th className="p-1 text-right">{tr('totalAmount')}</th>
                        </tr></thead>
                        <tbody>
                          {items.map((b) => (
                            <tr key={b.id} className="border-t border-[var(--border-card)]">
                              <td className="p-1">{localizeItem({ name: b.confirmed_name || b.raw_text, teluguName: b.telugu_name, hindiName: b.hindi_name }, uiLang as any)}{b.kind === 'charge' ? ` (${tr('item')})` : ''}</td>
                              <td className="p-1">{b.qty || '—'}</td>
                              <td className="p-1">{b.rate || '—'}</td>
                              <td className="p-1 text-right">{Number(b.amount) > 0 ? fmtINR(b.amount) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <p className="text-[11px] text-[var(--text-faint)]">{tr('noItemizedBillItems')}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Purchases Tab (with delete) ---- */

function PurchasesTab({ purchases, purchaseItems, fmtINR, fmtDate, tr, manage, shopId }: {
  purchases: any[]; purchaseItems: any[]; fmtINR: (n: number | string) => string; fmtDate: (d: string) => string; tr: (k: string) => string;
  manage: (action: string, entityType: string, entityId?: string, data?: any) => Promise<void>; shopId: string;
}) {
  if (purchases.length === 0) return <EmptyState message={tr('noPurchasesInShop')} />;
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
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold">{fmtINR(p.total)}</span>
                <DeleteButton label="Delete" onClick={() => manage('delete', 'purchase', p.id)} />
              </div>
            </div>
            {items.length > 0 && (
              <div className="mt-2 border-t border-[var(--border-card)] pt-2">
                <table className="w-full text-[11px]">
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}><td className="p-1">{i.name}</td><td className="p-1">{i.qty}</td><td className="p-1 text-right">{fmtINR(i.amount)}</td></tr>
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

/* ---- Suppliers Tab (with delete) ---- */

function SuppliersTab({ suppliers, fmtDate, tr, manage }: { suppliers: any[]; fmtDate: (d: string) => string; tr: (k: string) => string; manage: (action: string, entityType: string, entityId?: string) => Promise<void> }) {
  if (suppliers.length === 0) return <EmptyState message={tr('noSuppliersInShop')} />;
  return (
    <div className="space-y-2">
      {suppliers.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] p-3">
          <div>
            <p className="text-sm font-medium">{s.name}</p>
            <p className="text-[11px] text-[var(--text-faint)]">{s.phone || '—'} · {fmtDate(s.created_at)}</p>
          </div>
          <DeleteButton label="Delete" onClick={() => manage('delete', 'supplier', s.id)} />
        </div>
      ))}
    </div>
  );
}

/* ---- Catalog Tab (with edit/delete) ---- */

function CatalogTab({ items, uiLang, tr, manage }: { items: any[]; uiLang: string; tr: (k: string) => string; manage: (action: string, entityType: string, entityId?: string, data?: any) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  if (items.length === 0) return <EmptyState message={tr('noCatalogItemsInShop')} />;

  const startEdit = (i: any) => {
    setEditing(i.id);
    setEditForm({ name: i.name, default_sell_price: i.default_sell_price || '', telugu_name: i.telugu_name || i.teluguName || '', hindi_name: i.hindi_name || i.hindiName || '', active: i.active });
  };

  const saveEdit = async (id: string) => {
    await manage('update', 'catalogItem', id, editForm);
    setEditing(null);
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.id} className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] p-3">
          {editing === i.id ? (
            <div className="space-y-2">
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" className="w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
              <input value={editForm.default_sell_price} onChange={(e) => setEditForm({ ...editForm, default_sell_price: e.target.value })} placeholder="Default price" className="w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
              <input value={editForm.telugu_name} onChange={(e) => setEditForm({ ...editForm, telugu_name: e.target.value })} placeholder="Telugu name" className="w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
              <input value={editForm.hindi_name} onChange={(e) => setEditForm({ ...editForm, hindi_name: e.target.value })} placeholder="Hindi name" className="w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> {tr('active')}</label>
              <div className="flex gap-2">
                <button onClick={() => saveEdit(i.id)} className="rounded bg-[var(--bg-primary)] px-3 py-1 text-xs font-medium text-[var(--text-on-primary)]">Save</button>
                <button onClick={() => setEditing(null)} className="rounded bg-[var(--bg-card-hover)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{localizeItem({ name: i.name, teluguName: i.teluguName, hindiName: i.hindiName }, uiLang as any)}</p>
                {i.default_sell_price && <p className="text-xs text-[var(--text-faint)] mt-0.5">{tr('defaultPrice')}: ₹{i.default_sell_price}</p>}
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] ${i.active ? 'bg-[var(--bg-success)] text-[var(--text-on-primary)]' : 'bg-[var(--bg-card-hover)] text-[var(--text-faint)]'}`}>{i.active ? tr('active') : tr('inactive')}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(i)} className="rounded bg-[var(--bg-card-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">Edit</button>
                <DeleteButton label="Delete" onClick={() => manage('delete', 'catalogItem', i.id)} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---- Settings Tab ---- */

function SettingsTab({ shopId, tr, manage, router }: { shopId: string; tr: (k: string) => string; manage: (action: string, entityType: string, entityId?: string, data?: any) => Promise<void>; router: any }) {
  const [shop, setShop] = useState<any>(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/shops').then(r => r.json()).then(d => {
      const s = d.shops?.find((s: any) => s.id === shopId);
      if (s) { setShop(s); setForm({ name: s.name || '', address: s.address || '', phone: s.phone || '' }); }
    });
  }, [shopId]);

  const save = async () => {
    setSaving(true);
    const res = await fetch('/api/admin/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId, action: 'updateShop', ...form }),
    });
    const r = await res.json();
    setSaving(false);
    setMsg(r.ok ? 'Saved' : (r.error || 'Failed'));
    setTimeout(() => setMsg(''), 2000);
  };

  const deleteShop = async () => {
    const res = await fetch('/api/admin/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId, action: 'deleteShop' }),
    });
    const r = await res.json();
    if (r.ok) router.push('/admin');
  };

  if (!shop) return <p className="text-sm text-[var(--text-faint)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold">Shop Settings</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-[11px] text-[var(--text-faint)]">Shop name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-faint)]">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="text-[11px] text-[var(--text-faint)]">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="rounded-lg bg-[var(--bg-primary)] px-4 py-2 text-sm font-medium text-[var(--text-on-primary)] disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            {msg && <span className="text-xs text-[var(--text-faint)]">{msg}</span>}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
        <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
        <p className="mt-1 text-xs text-[var(--text-faint)]">Delete this shop and ALL its data (customers, transactions, purchases, suppliers, catalog). This cannot be undone.</p>
        <div className="mt-3">
          <DeleteButton label="Delete entire shop" onClick={deleteShop} />
        </div>
      </section>
    </div>
  );
}
