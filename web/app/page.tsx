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
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
      <main className="min-h-screen bg-[#f5f0e6] p-6 text-[#3a2f2f]">
        <p className="text-center text-[#8a7a6a]">{t('loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f0e6] p-6 text-[#3a2f2f]">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('appTitle')}</h1>
          <p className="text-sm text-[#8a7a6a]">
            {configured ? t('liveFrom') : 'Preview from local CSV'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <LanguageSwitcher />
          <div className="flex gap-2">
            <a
              href="/payment"
              className="rounded-lg bg-[#2d6b4f] px-4 py-2 text-white hover:bg-[#22513a]"
            >
              {t('recordPayment')}
            </a>
            <a
              href="/upload"
              className="rounded-lg bg-[#8b2e2e] px-4 py-2 text-white hover:bg-[#6b2222]"
            >
              {t('uploadBill')}
            </a>
          </div>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#e8e0d2] p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-[#7a6a5a]">{t('billed')}</p>
          <p className="text-2xl font-bold">{fmt(totalBilled)}</p>
        </div>
        <div className="rounded-2xl bg-[#e8e0d2] p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-[#7a6a5a]">{t('paid')}</p>
          <p className="text-2xl font-bold">{fmt(totalPaid)}</p>
        </div>
        <div className="rounded-2xl bg-[#e8e0d2] p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-[#7a6a5a]">{t('due')}</p>
          <p className="text-2xl font-bold text-[#8b2e2e]">{fmt(totalDue)}</p>
        </div>
      </section>

      {customers.length === 0 && (
        <p className="text-center text-[#8a7a6a]">{t('noCustomers')}</p>
      )}

      <section className="space-y-4">
        {customers.map((cust) => (
          <div key={cust.id} className="rounded-2xl bg-[#e8e0d2] p-4">
            <div className="mb-2 flex items-center justify-between border-b border-[#d9d0c2] pb-2">
              <h2 className="text-lg font-semibold">{cust.name}</h2>
              <div className="text-right text-sm">
                <p>{t('billed')}: {fmt(cust.billed)}</p>
                <p>{t('paid')}: {fmt(cust.paid)}</p>
                <p className="font-semibold text-[#8b2e2e]">{t('due')}: {fmt(cust.due)}</p>
              </div>
            </div>
            <div className="space-y-3">
              {cust.txns.map((txn) => (
                <div key={txn.id} className="rounded-xl bg-[#f5f0e6] p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#7a6a5a]">{fmtDate(txn.date)}</p>
                      <p className="font-medium">{txnTitle(txn)}</p>
                      {txn.market?.marketYard && (
                        <p className="text-xs text-[#8a7a6a]">
                          {yardById(txn.market.marketYard)?.name || txn.market.marketYard}
                          {txn.market.lotNo ? ` · ${t('lotNo')} ${txn.market.lotNo}` : ''}
                          {txn.market.vehicleNo ? ` · ${txn.market.vehicleNo}` : ''}
                        </p>
                      )}
                    </div>
                    <p className={`font-semibold ${txn.type === 'payment' ? 'text-[#2d6b4f]' : 'text-[#3a2f2f]'}`}>
                      {txn.type === 'payment' ? '−' : '+'}
                      {fmt(txn.amount)}
                    </p>
                  </div>
                  {txn.type === 'bill' && txn.items.length > 0 && (
                    <div className="mt-2 overflow-x-auto border-t border-[#e8e0d2] pt-2">
                      <table className="w-full text-sm tabular-nums">
                        <thead>
                          <tr className="text-left text-[#8a7a6a]">
                            <th className="py-1 pr-3 font-normal">{t('itemName')}</th>
                            <th className="w-24 py-1 text-right font-normal">{t('qty')}</th>
                            <th className="w-24 py-1 text-right font-normal">{t('rate')}</th>
                            <th className="w-28 py-1 text-right font-normal">{t('amt')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txn.items.map((it, idx) => (
                            <tr
                              key={idx}
                              className={`border-t border-[#e8e0d2] ${it.kind === 'charge' ? 'italic text-[#6b5344]' : ''}`}
                            >
                              <td className="py-1 pr-3">{localizeName(it.name, uiLang)}</td>
                              <td className="w-24 py-1 whitespace-nowrap text-right">{it.qty || ''}</td>
                              <td className="w-24 py-1 whitespace-nowrap text-right">{it.rate || ''}</td>
                              <td className="w-28 py-1 whitespace-nowrap text-right">{fmt(it.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-3 text-xs">
                    <span className="text-[#8a7a6a]">{t('balanceAfter')}: {fmt(txn.balanceAfter)}</span>
                    <DeleteButton id={txn.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
