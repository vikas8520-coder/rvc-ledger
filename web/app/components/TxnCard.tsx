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
    <div className="rounded-md bg-[#f5f0e6] px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] leading-none text-[#7a6a5a]">
            {fmtDate(txn.date)}
            {txn.market?.marketYard
              ? ` · ${yardById(txn.market.marketYard)?.name || txn.market.marketYard}`
              : ''}
          </span>
          <span className="ml-1.5 text-sm font-medium leading-none">{title}</span>
        </div>
        <p className={`shrink-0 text-sm font-semibold leading-none ${txn.type === 'payment' ? 'text-[#2d6b4f]' : 'text-[#3a2f2f]'}`}>
          {txn.type === 'payment' ? '−' : '+'}
          {fmt(txn.amount)}
        </p>
      </div>
      {!compact && txn.type === 'bill' && txn.items.length > 0 && (
        <div className="mt-1 space-y-0">
          {txn.items.map((it, idx) => (
            <div key={idx} className={`flex items-baseline gap-1 text-[11px] leading-tight ${it.kind === 'charge' ? 'italic text-[#6b5344]' : ''}`}>
              <span className="flex-1 truncate">{localizeName(it.name, uiLang)}</span>
              <span className="shrink-0 whitespace-nowrap text-[#7a6a5a]">
                {[it.qty, it.rate].filter(Boolean).join(' × ')}
              </span>
              <span className="shrink-0 whitespace-nowrap text-right tabular-nums" style={{ minWidth: '3rem' }}>{fmt(it.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px] leading-none">
        <span className="text-[#8a7a6a]">
          {t('balanceAfter')}: {fmt(txn.balanceAfter)}
        </span>
        <DeleteButton id={txn.id} />
      </div>
    </div>
  );
}
