'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useI18n } from '../../components/I18nProvider';
import { useDashboard } from '../../components/useDashboard';
import TxnCard from '../../components/TxnCard';
import { fmt } from '@/lib/format';

export default function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { customers, loading } = useDashboard();
  const customer = useMemo(() => customers.find((c) => c.id === id), [customers, id]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-[#8a7a6a]">{t('loading')}</p>;
  }

  if (!customer) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#8a7a6a]">{t('noCustomers')}</p>
        <Link href="/customers" className="text-sm text-[#8b2e2e] hover:underline">
          {t('allCustomers')}
        </Link>
      </div>
    );
  }

  const bills = customer.txns.filter((x) => x.type === 'bill').length;
  const payments = customer.txns.filter((x) => x.type === 'payment').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/customers" className="text-xs text-[#8b2e2e] hover:underline">
            ← {t('allCustomers')}
          </Link>
          <h1 className="text-xl font-bold">{customer.name}</h1>
          <p className="text-xs text-[#7a6a5a]">
            {t('bills')} {bills} · {t('payments')} {payments}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/payment" className="rounded-md bg-[#2d6b4f] px-3 py-1.5 text-sm text-white">
            {t('recordPayment')}
          </Link>
          <Link href="/upload" className="rounded-md bg-[#8b2e2e] px-3 py-1.5 text-sm text-white">
            {t('uploadBill')}
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#e8e0d2] px-3 py-2">
          <p className="text-[10px] uppercase text-[#7a6a5a]">{t('billed')}</p>
          <p className="font-bold">{fmt(customer.billed)}</p>
        </div>
        <div className="rounded-lg bg-[#e8e0d2] px-3 py-2">
          <p className="text-[10px] uppercase text-[#7a6a5a]">{t('paid')}</p>
          <p className="font-bold">{fmt(customer.paid)}</p>
        </div>
        <div className="rounded-lg bg-[#e8e0d2] px-3 py-2">
          <p className="text-[10px] uppercase text-[#7a6a5a]">{t('due')}</p>
          <p className="font-bold text-[#8b2e2e]">{fmt(customer.due)}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('ledger')}</h2>
        {customer.txns.length === 0 && <p className="text-sm text-[#8a7a6a]">{t('noActivity')}</p>}
        {customer.txns.map((txn) => (
          <TxnCard key={txn.id} txn={txn} />
        ))}
      </section>
    </div>
  );
}
