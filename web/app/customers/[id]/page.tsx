'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../components/I18nProvider';
import { useDashboard } from '../../components/useDashboard';
import TxnCard from '../../components/TxnCard';
import AgingBadge from '../../components/AgingBadge';
import { fmt, fmtDate } from '@/lib/format';
import {
  computeAging,
  customerCsv,
  downloadCsv,
  reminderText,
  statementText,
  waLink,
} from '@/lib/statement';

export default function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { customers, loading } = useDashboard();
  const customer = useMemo(() => customers.find((c) => c.id === id), [customers, id]);

  const [phone, setPhone] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (customer?.phone) setPhone(customer.phone);
  }, [customer?.phone]);

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
  const aging = computeAging(customer.txns);

  const savePhone = async () => {
    setPhoneStatus('saving');
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error('save failed');
      setPhoneStatus('saved');
      setTimeout(() => setPhoneStatus('idle'), 1500);
    } catch {
      setPhoneStatus('idle');
    }
  };

  const copyStatement = async () => {
    try {
      await navigator.clipboard.writeText(statementText(customer));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href="/customers" className="text-xs text-[#8b2e2e] hover:underline">
          ← {t('allCustomers')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{customer.name}</h1>
          <AgingBadge aging={aging} />
        </div>
        <p className="text-xs text-[#7a6a5a]">
          {t('bills')} {bills} · {t('payments')} {payments}
          {aging.oldestDate
            ? ` · ${t('oldestUnpaid')} ${fmtDate(aging.oldestDate)} (${aging.oldestDays} ${t('days')})`
            : ''}
        </p>
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

      <section className="rounded-lg bg-[#e8e0d2] p-3">
        <div className="flex flex-wrap gap-2">
          <a
            href={waLink(reminderText(customer), customer.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-md px-3 py-1.5 text-sm text-white ${customer.due > 0 ? 'bg-[#2d6b4f]' : 'bg-[#a8a095] pointer-events-none'}`}
          >
            {t('sendReminder')}
          </a>
          <a
            href={waLink(statementText(customer), customer.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-[#8b2e2e] px-3 py-1.5 text-sm text-white"
          >
            {t('shareStatement')}
          </a>
          <button
            onClick={copyStatement}
            className="rounded-md border border-[#c9c0b2] bg-[#f5f0e6] px-3 py-1.5 text-sm"
          >
            {copied ? t('copied') : t('copyStatement')}
          </button>
          <button
            onClick={() =>
              downloadCsv(`${customer.name.replace(/\s+/g, '-')}-ledger.csv`, customerCsv(customer))
            }
            className="rounded-md border border-[#c9c0b2] bg-[#f5f0e6] px-3 py-1.5 text-sm"
          >
            {t('exportCsv')}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-[#7a6a5a]">{t('phone')}</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('addPhone')}
            inputMode="tel"
            className="min-w-0 flex-1 rounded-md border border-[#c9c0b2] bg-white px-2 py-1 text-sm sm:w-48 sm:flex-none"
          />
          <button
            onClick={savePhone}
            disabled={phoneStatus === 'saving'}
            className="rounded-md bg-[#5a4a3a] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {phoneStatus === 'saved' ? t('saved') : t('savePhone')}
          </button>
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
