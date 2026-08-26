'use client';

import { useEffect, useState } from 'react';
import { Customer } from '@/lib/types';
import DeleteButton from './components/DeleteButton';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useI18n } from './components/I18nProvider';
import { getUiLang } from '@/lib/i18n';
import { localizeName } from '@/lib/catalog';
import { yardById } from '@/lib/market';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Home() {
  const { lang, t } = useI18n();
  const uiLang = getUiLang(lang);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCustomers(data);
          setConfigured(true);
        } else if (data.customers) {
          setCustomers(data.customers);
          setConfigured(data.configured ?? true);
        }
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, []);

  const totalBilled = customers.reduce((s, c) => s + c.billed, 0);
  const totalPaid = customers.reduce((s, c) => s + c.paid, 0);
  const totalDue = customers.reduce((s, c) => s + c.due, 0);

  const txnTitle = (txn: Customer['txns'][number]) => {
    if (txn.type === 'payment') return t('paymentReceived');
    if (txn.billNo) return `${t('billNo')} ${txn.billNo}`;
    return t('bill');
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f0e6] text-[#3a2f2f]">
        <p className="px-3 py-8 text-center text-sm text-[#8a7a6a]">{t('loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f0e6] text-[#3a2f2f]">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{t('appTitle')}</h1>
          <p className="text-xs text-[#8a7a6a]">
            {configured ? t('liveFrom') : 'Preview from local CSV'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LanguageSwitcher />
          <a
            href="/payment"
            className="rounded-md bg-[#2d6b4f] px-3 py-1.5 text-sm text-white hover:bg-[#22513a]"
          >
            {t('recordPayment')}
          </a>
          <a
            href="/upload"
            className="rounded-md bg-[#8b2e2e] px-3 py-1.5 text-sm text-white hover:bg-[#6b2222]"
          >
            {t('uploadBill')}
          </a>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#e8e0d2] px-2 py-2 text-center sm:px-3">
          <p className="text-[10px] uppercase tracking-wide text-[#7a6a5a] sm:text-xs">{t('billed')}</p>
          <p className="text-sm font-bold sm:text-lg">{fmt(totalBilled)}</p>
        </div>
        <div className="rounded-lg bg-[#e8e0d2] px-2 py-2 text-center sm:px-3">
          <p className="text-[10px] uppercase tracking-wide text-[#7a6a5a] sm:text-xs">{t('paid')}</p>
          <p className="text-sm font-bold sm:text-lg">{fmt(totalPaid)}</p>
        </div>
        <div className="rounded-lg bg-[#e8e0d2] px-2 py-2 text-center sm:px-3">
          <p className="text-[10px] uppercase tracking-wide text-[#7a6a5a] sm:text-xs">{t('due')}</p>
          <p className="text-sm font-bold text-[#8b2e2e] sm:text-lg">{fmt(totalDue)}</p>
        </div>
      </section>

      {customers.length === 0 && (
        <p className="text-center text-sm text-[#8a7a6a]">{t('noCustomers')}</p>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        {customers.map((cust) => (
          <div key={cust.id} className="rounded-lg bg-[#e8e0d2] p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[#d9d0c2] pb-1.5">
              <h2 className="truncate text-base font-semibold">{cust.name}</h2>
              <p className="shrink-0 text-xs">
                <span className="text-[#7a6a5a]">{t('due')}</span>{' '}
                <span className="font-semibold text-[#8b2e2e]">{fmt(cust.due)}</span>
              </p>
            </div>
            <p className="mb-2 text-[11px] text-[#7a6a5a]">
              {t('billed')} {fmt(cust.billed)} · {t('paid')} {fmt(cust.paid)}
            </p>
            <div className="space-y-2">
              {cust.txns.map((txn) => (
                <div key={txn.id} className="rounded-md bg-[#f5f0e6] p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#7a6a5a]">
                        {fmtDate(txn.date)}
                        {txn.market?.marketYard
                          ? ` · ${yardById(txn.market.marketYard)?.name || txn.market.marketYard}`
                          : ''}
                      </p>
                      <p className="text-sm font-medium leading-tight">{txnTitle(txn)}</p>
                    </div>
                    <p className={`shrink-0 text-sm font-semibold ${txn.type === 'payment' ? 'text-[#2d6b4f]' : 'text-[#3a2f2f]'}`}>
                      {txn.type === 'payment' ? '−' : '+'}
                      {fmt(txn.amount)}
                    </p>
                  </div>
                  {txn.type === 'bill' && txn.items.length > 0 && (
                    <table className="mt-1.5 w-full text-[12px] tabular-nums leading-5">
                      <tbody>
                        {txn.items.map((it, idx) => (
                          <tr
                            key={idx}
                            className={it.kind === 'charge' ? 'italic text-[#6b5344]' : ''}
                          >
                            <td className="pr-2 align-top">{localizeName(it.name, uiLang)}</td>
                            <td className="whitespace-nowrap pr-2 text-right text-[#7a6a5a]">
                              {[it.qty, it.rate].filter(Boolean).join(' × ')}
                            </td>
                            <td className="whitespace-nowrap text-right">{fmt(it.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
                    <span className="text-[#8a7a6a]">{t('balanceAfter')}: {fmt(txn.balanceAfter)}</span>
                    <DeleteButton id={txn.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
      </div>
    </main>
  );
}
