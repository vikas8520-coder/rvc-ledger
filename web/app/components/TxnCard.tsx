'use client';

import { Customer } from '@/lib/types';
import { localizeName } from '@/lib/catalog';
import { yardById } from '@/lib/market';
import { fmt, fmtDate } from '@/lib/format';
import { getUiLang } from '@/lib/i18n';
import { useI18n } from './I18nProvider';
import DeleteButton from './DeleteButton';

export default function TxnCard({
  txn,
  compact = false,
}: {
  txn: Customer['txns'][number];
  compact?: boolean;
}) {
  const { lang, t } = useI18n();
  const uiLang = getUiLang(lang);

  const title =
    txn.type === 'payment'
      ? t('paymentReceived')
      : txn.billNo
        ? `${t('billNo')} ${txn.billNo}`
        : t('bill');

  return (
    <div className="rounded-md bg-[#f5f0e6] p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-[#7a6a5a]">
            {fmtDate(txn.date)}
            {txn.market?.marketYard
              ? ` · ${yardById(txn.market.marketYard)?.name || txn.market.marketYard}`
              : ''}
          </p>
          <p className="text-sm font-medium leading-tight">{title}</p>
        </div>
        <p className={`shrink-0 text-sm font-semibold ${txn.type === 'payment' ? 'text-[#2d6b4f]' : 'text-[#3a2f2f]'}`}>
          {txn.type === 'payment' ? '−' : '+'}
          {fmt(txn.amount)}
        </p>
      </div>
      {!compact && txn.type === 'bill' && txn.items.length > 0 && (
        <table className="mt-1.5 w-full text-[12px] tabular-nums leading-5">
          <tbody>
            {txn.items.map((it, idx) => (
              <tr key={idx} className={it.kind === 'charge' ? 'italic text-[#6b5344]' : ''}>
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
        <span className="text-[#8a7a6a]">
          {t('balanceAfter')}: {fmt(txn.balanceAfter)}
        </span>
        <DeleteButton id={txn.id} />
      </div>
    </div>
  );
}
