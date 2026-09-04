'use client';

import { useState } from 'react';
import { Customer, TxnView } from '@/lib/types';
import { localizeName } from '@/lib/catalog';
import { yardById } from '@/lib/market';
import { fmt, fmtDate, fmtTime } from '@/lib/format';
import { getUiLang, formatCustomerName } from '@/lib/i18n';
import { useI18n } from './I18nProvider';
import DeleteButton from './DeleteButton';
import { printBill, txnToBillData, BillFormat, ShopProfile } from '@/lib/billPrint';
import { generateBillsPdf, sharePdfViaWhatsApp } from '@/lib/pdfShare';

export default function LedgerTable({
  customer,
  shop,
  defaultFormat = 'itemized',
  filteredTxns,
  openingBalance = 0,
  readOnly = false,
}: {
  customer: Customer;
  shop?: ShopProfile;
  defaultFormat?: BillFormat;
  filteredTxns?: TxnView[];
  openingBalance?: number;
  readOnly?: boolean;
}) {
  const { lang, t } = useI18n();
  const uiLang = getUiLang(lang);
  const [printMenuTxn, setPrintMenuTxn] = useState<string | null>(null);

  // Use filtered txns if provided, otherwise all txns
  const txns = filteredTxns !== undefined ? filteredTxns : customer.txns;
  const hasDateFilter = filteredTxns !== undefined;

  if (txns.length === 0 && !hasDateFilter) {
    return <p className="text-sm text-[var(--text-faint)]">{t('noActivity')}</p>;
  }

  // Build flat row list: each item is its own row, bills get a total row at the end
  type Row = {
    txnId: string;
    date: string;
    time: string;
    particulars: string;
    qty: string;
    rate: string;
    debit: number;  // bill amount (customer owes more)
    credit: number; // payment amount (customer paid)
    balance: number | null;
    isTotal: boolean;
    isPayment: boolean;
    isCharge: boolean;
    isFirst: boolean;
    isOpening: boolean;
  };

  const rows: Row[] = [];

  // Opening balance row (only when date filter is active)
  if (hasDateFilter) {
    rows.push({
      txnId: '__opening__',
      date: '',
      time: '',
      particulars: t('openingBalance'),
      qty: '',
      rate: '',
      debit: openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      balance: openingBalance,
      isTotal: true,
      isPayment: false,
      isCharge: false,
      isFirst: true,
      isOpening: true,
    });
  }

  // Running balance starts from opening balance if filtering, else 0
  let runningBalance = hasDateFilter ? openingBalance : 0;

  for (const txn of txns) {
    const isPayment = txn.type === 'payment';
    const yard = txn.market?.marketYard
      ? ` · ${yardById(txn.market.marketYard)?.name || txn.market.marketYard}`
      : '';

    if (isPayment) {
      runningBalance -= txn.amount;
      rows.push({
        txnId: txn.id,
        date: fmtDate(txn.date),
        time: fmtTime(txn.createdAt),
        particulars: t('paymentReceived'),
        qty: '—',
        rate: '—',
        debit: 0,
        credit: txn.amount,
        balance: runningBalance,
        isTotal: true,
        isPayment: true,
        isCharge: false,
        isFirst: true,
        isOpening: false,
      });
    } else {
      const title = txn.billNo ? `${t('billNo')} ${txn.billNo}` : t('bill');
      const hasItems = txn.items.length > 0;

      if (hasItems) {
        txn.items.forEach((it, idx) => {
          rows.push({
            txnId: txn.id,
            date: idx === 0 ? fmtDate(txn.date) : '',
            time: idx === 0 ? fmtTime(txn.createdAt) : '',
            particulars: idx === 0 ? `${title}${yard}` : localizeName(it.name, uiLang),
            qty: it.qty || '—',
            rate: it.rate || '—',
            debit: it.amount,
            credit: 0,
            balance: null,
            isTotal: false,
            isPayment: false,
            isCharge: it.kind === 'charge',
            isFirst: idx === 0,
            isOpening: false,
          });
        });
        runningBalance += txn.amount;
        rows.push({
          txnId: txn.id,
          date: '',
          time: '',
          particulars: t('billTotal'),
          qty: '',
          rate: '',
          debit: txn.amount,
          credit: 0,
          balance: runningBalance,
          isTotal: true,
          isPayment: false,
          isCharge: false,
          isFirst: false,
          isOpening: false,
        });
      } else {
        runningBalance += txn.amount;
        rows.push({
          txnId: txn.id,
          date: fmtDate(txn.date),
          time: fmtTime(txn.createdAt),
          particulars: `${title}${yard}`,
          qty: '—',
          rate: '—',
          debit: txn.amount,
          credit: 0,
          balance: runningBalance,
          isTotal: true,
          isPayment: false,
          isCharge: false,
          isFirst: true,
          isOpening: false,
        });
      }
    }
  }

  // Track which txnIds should show delete button (on the total row)
  const lastRowOfTxn = new Map<string, number>();
  rows.forEach((r, i) => {
    lastRowOfTxn.set(r.txnId, i);
  });

  // Footer totals
  const totalDebit = rows.filter((r) => !r.isOpening).reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.filter((r) => !r.isOpening).reduce((s, r) => s + r.credit, 0);
  const closingBalance = runningBalance;

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-light)] bg-[var(--bg-input)] shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--bg-primary)] text-[var(--text-on-primary)]">
            <th className="w-[95px] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{t('date')}</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{t('particulars')}</th>
            <th className="w-[70px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('qty')}</th>
            <th className="w-[70px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('rate')}</th>
            <th className="w-[90px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('debit')}</th>
            <th className="w-[90px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">{t('credit')}</th>
            <th className="w-[35px] px-1 py-2.5"></th>
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
                <tr key={i} className={`${borderClass} ${r.isOpening ? 'bg-[var(--bg-base)] italic' : 'bg-[var(--bg-base)] font-semibold'}`}>
                  <td className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                    {r.date}{r.time ? <><br/><span className="text-[10px] text-[var(--text-faint)]">{r.time}</span></> : ''}
                  </td>
                  <td className={`px-3 py-1.5 ${r.isPayment ? 'text-[var(--bg-success)]' : r.isOpening ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                    {r.particulars}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-faint)]">{r.qty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-faint)]">{r.rate}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-primary)]">
                    {r.debit > 0 ? fmt(r.debit) : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--bg-success)]">
                    {r.credit > 0 ? fmt(r.credit) : ''}
                  </td>
                  <td className="px-1 py-1.5 text-center whitespace-nowrap">
                    {isLastOfTxn && !r.isOpening && shop && (
                      <span className="relative">
                        <button
                          onClick={() => setPrintMenuTxn(printMenuTxn === r.txnId ? null : r.txnId)}
                          className="text-[var(--bg-primary)] hover:bg-[var(--bg-base)] rounded p-0.5"
                          title={t('printShare')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'middle'}}>
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                          </svg>
                        </button>
                        {printMenuTxn === r.txnId && (
                          <span className="absolute right-0 top-4 z-10 flex max-w-[min(12rem,90vw)] flex-col gap-0.5 rounded-md border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                            {r.isPayment ? (
                              <>
                                <button
                                  onClick={() => {
                                    const txn = customer.txns.find((tx) => tx.id === r.txnId);
                                    if (txn) {
                                      const bill = txnToBillData(txn, formatCustomerName(customer, uiLang));
                                      printBill(bill, shop, 'simple');
                                    }
                                    setPrintMenuTxn(null);
                                  }}
                                  className="flex-1 whitespace-nowrap rounded px-2 py-1 text-left text-[10px] hover:bg-[var(--bg-card)]"
                                >
                                  🖳 Print Receipt
                                </button>
                                <button
                                  onClick={async () => {
                                    const txn = customer.txns.find((tx) => tx.id === r.txnId);
                                    if (txn) {
                                      const bill = txnToBillData(txn, formatCustomerName(customer, uiLang));
                                      const blob = generateBillsPdf([bill], shop, 'simple');
                                      const filename = `receipt-${r.txnId}.pdf`;
                                      const text = `${shop.shopName || 'RVC'} — ${formatCustomerName(customer, uiLang)} — Payment ₹${txn.amount}`;
                                      await sharePdfViaWhatsApp(blob, filename, text);
                                    }
                                    setPrintMenuTxn(null);
                                  }}
                                  className="flex-1 whitespace-nowrap rounded px-2 py-1 text-left text-[10px] hover:bg-[var(--bg-card)]"
                                  style={{color:'#25D366'}}
                                >
                                  WhatsApp
                                </button>
                              </>
                            ) : (
                              <>
                                {(['simple', 'itemized', 'market', 'patti'] as BillFormat[]).map((f) => (
                                  <div key={f} className="flex gap-0.5">
                                    <button
                                      onClick={() => {
                                        const txn = customer.txns.find((tx) => tx.id === r.txnId);
                                        if (txn) printBill(txnToBillData(txn, formatCustomerName(customer, uiLang)), shop, f);
                                        setPrintMenuTxn(null);
                                      }}
                                      className="flex-1 whitespace-nowrap rounded px-2 py-1 text-left text-[10px] hover:bg-[var(--bg-card)]"
                                    >
                                      🖳 {t(`billFormat${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const txn = customer.txns.find((tx) => tx.id === r.txnId);
                                        if (txn) {
                                          const bill = txnToBillData(txn, formatCustomerName(customer, uiLang));
                                          const pdfFormat = (f === 'market' ? 'itemized' : f) as 'simple' | 'itemized' | 'patti';
                                          const blob = generateBillsPdf([bill], shop, pdfFormat);
                                          const filename = `${f}-${r.txnId}.pdf`;
                                          const text = `${shop.shopName || 'RVC'} — ${formatCustomerName(customer, uiLang)} — ₹${txn.amount}`;
                                          await sharePdfViaWhatsApp(blob, filename, text);
                                        }
                                        setPrintMenuTxn(null);
                                      }}
                                      className="whitespace-nowrap rounded px-2 py-1 text-left text-[10px] hover:bg-[var(--bg-card)]"
                                      style={{color:'#25D366'}}
                                    >
                                      WA
                                    </button>
                                  </div>
                                ))}
                              </>
                            )}
                            <button
                              onClick={() => setPrintMenuTxn(null)}
                              className="whitespace-nowrap rounded px-2 py-1 text-left text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-card)]"
                            >
                              ✕ Cancel
                            </button>
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">
                    {r.balance !== null ? fmt(r.balance) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {isLastOfTxn && !r.isOpening && !readOnly && <DeleteButton id={r.txnId} />}
                  </td>
                </tr>
              );
            }

            // Regular item row
            return (
              <tr key={i} className={`${borderClass} ${r.isCharge ? 'italic text-[#6b5344]' : ''}`}>
                <td className="px-3 py-1 text-xs text-[var(--text-secondary)]">
                  {r.date}{r.time ? <><br/><span className="text-[10px] text-[var(--text-faint)]">{r.time}</span></> : ''}
                </td>
                <td className="px-3 py-1 text-[var(--text-primary)]">
                  {r.isFirst ? <span className="font-semibold">{r.particulars}</span> : r.particulars}
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-[var(--text-muted)]">{r.qty}</td>
                <td className="px-3 py-1 text-right tabular-nums text-[var(--text-muted)]">{r.rate}</td>
                <td className="px-3 py-1 text-right tabular-nums">{fmt(r.debit)}</td>
                <td className="px-3 py-1 text-right tabular-nums text-[var(--bg-success)]"></td>
                <td className="px-1 py-1"></td>
                <td className="px-3 py-1 text-right tabular-nums text-[var(--border-input)]"></td>
                <td className="px-2 py-1"></td>
              </tr>
            );
          })}
        </tbody>
        {/* Footer totals */}
        <tfoot>
          <tr className="border-t-2 border-[var(--bg-primary)] bg-[var(--bg-base)] font-bold">
            <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {t('total')}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{fmt(totalDebit)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-[var(--bg-success)]">{fmt(totalCredit)}</td>
            <td></td>
            <td className="px-3 py-2 text-right tabular-nums text-[var(--bg-primary)]">{fmt(closingBalance)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
