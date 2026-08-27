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

  return (
    <div className="overflow-x-auto rounded-lg border border-[#d9d0c2] bg-white">
      <table className="w-full border-collapse text-sm table-fixed">
        <colgroup>
          <col className="w-[70px]" />
          <col />
          <col className="w-[70px]" />
          <col className="w-[70px]" />
          <col className="w-[90px]" />
          <col className="w-[100px]" />
          <col className="w-[50px]" />
        </colgroup>
        <thead>
          <tr className="bg-[#8b2e2e] text-white">
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">{t('date')}</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">{t('description')}</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">{t('qty')}</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">{t('rate')}</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">{t('amt')}</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">{t('balanceAfter')}</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {customer.txns.map((txn) => {
            const title =
              txn.type === 'payment'
                ? t('paymentReceived')
                : txn.billNo
                  ? `${t('billNo')} ${txn.billNo}`
                  : t('bill');

            const isPayment = txn.type === 'payment';
            const hasItems = !isPayment && txn.items.length > 0;
            const yard = txn.market?.marketYard
              ? ` · ${yardById(txn.market.marketYard)?.name || txn.market.marketYard}`
              : '';

            if (isPayment) {
              // Payment: single row, description spans qty+rate columns
              return (
                <tr key={txn.id} className="border-t-2 border-[#d9d0c2] bg-[#f0f8f3]">
                  <td className="px-3 py-2 text-xs font-medium text-[#5a4a3a]">{fmtDate(txn.date)}</td>
                  <td className="px-3 py-2 font-semibold text-[#2d6b4f]" colSpan={3}>
                    {title}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-[#2d6b4f]">
                    −{fmt(txn.amount)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#5a4a3a]">
                    {fmt(txn.balanceAfter)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <DeleteButton id={txn.id} />
                  </td>
                </tr>
              );
            }

            // Bill with items
            return (
              <tbody key={txn.id} className="align-top">
                {/* Bill header row — description spans qty+rate, shows total amount + balance */}
                <tr className="border-t-2 border-[#d9d0c2] bg-[#f5f0e6]">
                  <td className="px-3 py-1.5 text-xs font-medium text-[#5a4a3a]" rowSpan={hasItems ? txn.items.length + 1 : 1}>
                    {fmtDate(txn.date)}
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-[#3a2f2f]" colSpan={3}>
                    {title}
                    {yard && <span className="ml-1 text-[11px] font-normal text-[#8a7a6a]">{yard}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums text-[#3a2f2f]">
                    +{fmt(txn.amount)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#5a4a3a]" rowSpan={hasItems ? txn.items.length + 1 : 1}>
                    {fmt(txn.balanceAfter)}
                  </td>
                  <td className="px-2 py-1.5 text-right" rowSpan={hasItems ? txn.items.length + 1 : 1}>
                    <DeleteButton id={txn.id} />
                  </td>
                </tr>

                {/* Item rows — qty, rate, amount filled; no empty balance cell */}
                {hasItems && txn.items.map((it, idx) => (
                  <tr key={idx} className={`border-t border-[#ece5d8] ${it.kind === 'charge' ? 'italic text-[#6b5344]' : ''}`}>
                    <td className="px-3 py-1 text-[#3a2f2f]">{localizeName(it.name, uiLang)}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-[#7a6a5a]">{it.qty || '—'}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-[#7a6a5a]">{it.rate || '—'}</td>
                    <td className="px-3 py-1 text-right tabular-nums font-medium">{fmt(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
