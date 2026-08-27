'use client';

import { Customer } from '@/lib/types';
import { localizeName } from '@/lib/catalog';
import { yardById } from '@/lib/market';
import { fmt, fmtDate } from '@/lib/format';
import { getUiLang } from '@/lib/i18n';
import { useI18n } from './I18nProvider';
import DeleteButton from './DeleteButton';

export default function LedgerTable({ customer }: { customer: Customer }) {
  const { lang, t } = useI18n();
  const uiLang = getUiLang(lang);

  if (customer.txns.length === 0) {
    return <p className="text-sm text-[#8a7a6a]">{t('noActivity')}</p>;
  }

  // Build flat row list: each item is its own row, bills get a total row at the end
  type Row = {
    txnId: string;
    date: string;
    particulars: string;
    qty: string;
    rate: string;
    amount: number;
    balance: number | null;
    isTotal: boolean;
    isPayment: boolean;
    isCharge: boolean;
    isFirst: boolean;
  };

  const rows: Row[] = [];
  for (const txn of customer.txns) {
    const isPayment = txn.type === 'payment';
    const yard = txn.market?.marketYard
      ? ` · ${yardById(txn.market.marketYard)?.name || txn.market.marketYard}`
      : '';

    if (isPayment) {
      rows.push({
        txnId: txn.id,
        date: fmtDate(txn.date),
        particulars: t('paymentReceived'),
        qty: '—',
        rate: '—',
        amount: -txn.amount,
        balance: txn.balanceAfter,
        isTotal: true,
        isPayment: true,
        isCharge: false,
        isFirst: true,
      });
    } else {
      const title = txn.billNo ? `${t('billNo')} ${txn.billNo}` : t('bill');
      const hasItems = txn.items.length > 0;

      if (hasItems) {
        txn.items.forEach((it, idx) => {
          rows.push({
            txnId: txn.id,
            date: idx === 0 ? fmtDate(txn.date) : '',
            particulars: idx === 0 ? `${title}${yard}` : localizeName(it.name, uiLang),
            qty: it.qty || '—',
            rate: it.rate || '—',
            amount: it.amount,
            balance: null,
            isTotal: false,
            isPayment: false,
            isCharge: it.kind === 'charge',
            isFirst: idx === 0,
          });
        });
        // Total row
        rows.push({
          txnId: txn.id,
          date: '',
          particulars: t('billTotal'),
          qty: '',
          rate: '',
          amount: txn.amount,
          balance: txn.balanceAfter,
          isTotal: true,
          isPayment: false,
          isCharge: false,
          isFirst: false,
        });
      } else {
        // Bill with no items
        rows.push({
          txnId: txn.id,
          date: fmtDate(txn.date),
          particulars: `${title}${yard}`,
          qty: '—',
          rate: '—',
          amount: txn.amount,
          balance: txn.balanceAfter,
          isTotal: true,
          isPayment: false,
          isCharge: false,
          isFirst: true,
        });
      }
    }
  }

  // Track which txnIds should show delete button (on the total row)
  const lastRowOfTxn = new Map<string, number>();
  rows.forEach((r, i) => {
    lastRowOfTxn.set(r.txnId, i);
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-[#d9d0c2] bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#8b2e2e] text-white">
            <th className="w-[65px] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{t('date')}</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{t('particulars')}</th>
            <th className="w-[70px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('qty')}</th>
            <th className="w-[70px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('rate')}</th>
            <th className="w-[90px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('amt')}</th>
            <th className="w-[100px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('balanceAfter')}</th>
            <th className="w-[45px] px-2 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isLastOfTxn = lastRowOfTxn.get(r.txnId) === i;
            const borderClass = r.isFirst ? 'border-t-2 border-[#c9c0b2]' : 'border-t border-[#ece5d8]';

            if (r.isTotal) {
              // Total/subtotal row — bold, tinted background
              return (
                <tr key={i} className={`${borderClass} bg-[#f5f0e6] font-semibold`}>
                  <td className="px-3 py-1.5 text-xs text-[#5a4a3a]">{r.date}</td>
                  <td className={`px-3 py-1.5 ${r.isPayment ? 'text-[#2d6b4f]' : 'text-[#3a2f2f]'}`}>
                    {r.particulars}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#8a7a6a]">{r.qty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#8a7a6a]">{r.rate}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${r.isPayment ? 'text-[#2d6b4f]' : 'text-[#3a2f2f]'}`}>
                    {r.isPayment ? '−' : '+'}{fmt(Math.abs(r.amount))}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#5a4a3a]">
                    {r.balance !== null ? fmt(r.balance) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {isLastOfTxn && <DeleteButton id={r.txnId} />}
                  </td>
                </tr>
              );
            }

            // Regular item row
            return (
              <tr key={i} className={`${borderClass} ${r.isCharge ? 'italic text-[#6b5344]' : ''}`}>
                <td className="px-3 py-1 text-xs text-[#5a4a3a]">{r.date}</td>
                <td className="px-3 py-1 text-[#3a2f2f]">
                  {r.isFirst ? <span className="font-semibold">{r.particulars}</span> : r.particulars}
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-[#7a6a5a]">{r.qty}</td>
                <td className="px-3 py-1 text-right tabular-nums text-[#7a6a5a]">{r.rate}</td>
                <td className="px-3 py-1 text-right tabular-nums">{fmt(r.amount)}</td>
                <td className="px-3 py-1 text-right tabular-nums text-[#c9c0b2]"></td>
                <td className="px-2 py-1"></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
