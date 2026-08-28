'use client';

import { useState } from 'react';
import { Customer } from '@/lib/types';
import { localizeName } from '@/lib/catalog';
import { yardById } from '@/lib/market';
import { fmt, fmtDate } from '@/lib/format';
import { getUiLang } from '@/lib/i18n';
import { useI18n } from './I18nProvider';
import DeleteButton from './DeleteButton';
import { printBill, txnToBillData, BillFormat, ShopProfile } from '@/lib/billPrint';

export default function LedgerTable({
  customer,
  shop,
  defaultFormat = 'itemized',
}: {
  customer: Customer;
  shop?: ShopProfile;
  defaultFormat?: BillFormat;
}) {
  const { lang, t } = useI18n();
  const uiLang = getUiLang(lang);
  const [printMenuTxn, setPrintMenuTxn] = useState<string | null>(null);

  if (customer.txns.length === 0) {
    return <p className="text-sm text-[var(--text-faint)]">{t('noActivity')}</p>;
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
    <div className="overflow-x-auto rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--bg-primary)] text-[var(--text-on-primary)]">
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
            const borderClass = r.isFirst ? 'border-t-2 border-[var(--border-input)]' : 'border-t border-[var(--border-card)]';

            if (r.isTotal) {
              // Total/subtotal row — bold, tinted background
              return (
                <tr key={i} className={`${borderClass} bg-[var(--bg-base)] font-semibold`}>
                  <td className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">{r.date}</td>
                  <td className={`px-3 py-1.5 ${r.isPayment ? 'text-[var(--bg-success)]' : 'text-[var(--text-primary)]'}`}>
                    {r.particulars}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-faint)]">{r.qty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-faint)]">{r.rate}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${r.isPayment ? 'text-[var(--bg-success)]' : 'text-[var(--text-primary)]'}`}>
                    {r.isPayment ? '−' : '+'}{fmt(Math.abs(r.amount))}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">
                    {r.balance !== null ? fmt(r.balance) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {isLastOfTxn && !r.isPayment && shop && (
                      <span className="relative mr-1">
                        <button
                          onClick={() => setPrintMenuTxn(printMenuTxn === r.txnId ? null : r.txnId)}
                          className="text-[10px] text-[var(--bg-primary)] hover:underline"
                        >
                          {t('printBill')}
                        </button>
                        {printMenuTxn === r.txnId && (
                          <span className="absolute right-0 top-4 z-10 flex flex-col gap-0.5 rounded-md border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                            {(['simple', 'itemized', 'market'] as BillFormat[]).map((f) => (
                              <button
                                key={f}
                                onClick={() => {
                                  const txn = customer.txns.find((tx) => tx.id === r.txnId);
                                  if (txn) printBill(txnToBillData(txn, customer.name), shop, f);
                                  setPrintMenuTxn(null);
                                }}
                                className="whitespace-nowrap rounded px-2 py-1 text-left text-[10px] hover:bg-[var(--bg-card)]"
                              >
                                {t(`billFormat${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
                                {f === defaultFormat ? ' ✓' : ''}
                              </button>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                    {isLastOfTxn && <DeleteButton id={r.txnId} />}
                  </td>
                </tr>
              );
            }

            // Regular item row
            return (
              <tr key={i} className={`${borderClass} ${r.isCharge ? 'italic text-[#6b5344]' : ''}`}>
                <td className="px-3 py-1 text-xs text-[var(--text-secondary)]">{r.date}</td>
                <td className="px-3 py-1 text-[var(--text-primary)]">
                  {r.isFirst ? <span className="font-semibold">{r.particulars}</span> : r.particulars}
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-[var(--text-muted)]">{r.qty}</td>
                <td className="px-3 py-1 text-right tabular-nums text-[var(--text-muted)]">{r.rate}</td>
                <td className="px-3 py-1 text-right tabular-nums">{fmt(r.amount)}</td>
                <td className="px-3 py-1 text-right tabular-nums text-[var(--border-input)]"></td>
                <td className="px-2 py-1"></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
