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

export default function TxnCard({
  txn,
  compact = false,
  customerName,
  shop,
  defaultFormat = 'itemized',
}: {
  txn: Customer['txns'][number];
  compact?: boolean;
  customerName?: string;
  shop?: ShopProfile;
  defaultFormat?: BillFormat;
}) {
  const { lang, t } = useI18n();
  const uiLang = getUiLang(lang);
  const [showFormats, setShowFormats] = useState(false);

  const title =
    txn.type === 'payment'
      ? t('paymentReceived')
      : txn.billNo
        ? `${t('billNo')} ${txn.billNo}`
        : t('bill');

  return (
    <div className="rounded-md bg-[var(--bg-base)] px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] leading-none text-[var(--text-muted)]">
            {fmtDate(txn.date)}
            {txn.market?.marketYard
              ? ` · ${yardById(txn.market.marketYard)?.name || txn.market.marketYard}`
              : ''}
          </span>
          <span className="ml-1.5 text-sm font-medium leading-none">{title}</span>
        </div>
        <p className={`shrink-0 text-sm font-semibold leading-none ${txn.type === 'payment' ? 'text-[var(--bg-success)]' : 'text-[var(--text-primary)]'}`}>
          {txn.type === 'payment' ? '−' : '+'}
          {fmt(txn.amount)}
        </p>
      </div>
      {!compact && txn.type === 'bill' && txn.items.length > 0 && (
        <div className="mt-1 space-y-0">
          {txn.items.map((it, idx) => (
            <div key={idx} className={`flex items-baseline gap-2 text-[11px] leading-tight ${it.kind === 'charge' ? 'italic text-[#6b5344]' : ''}`}>
              <span className="truncate">{localizeName(it.name, uiLang)}</span>
              <span className="shrink-0 whitespace-nowrap text-[var(--text-muted)]">
                {[it.qty, it.rate].filter(Boolean).join(' × ')}
              </span>
              <span className="shrink-0 whitespace-nowrap text-right tabular-nums">{fmt(it.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px] leading-none">
        <span className="text-[var(--text-faint)]">
          {t('balanceAfter')}: {fmt(txn.balanceAfter)}
        </span>
        {txn.type === 'bill' && customerName && shop && (
          <span className="relative">
            <button
              onClick={() => setShowFormats((v) => !v)}
              className="text-[var(--bg-primary)] hover:underline"
            >
              {t('printBill')}
            </button>
            {showFormats && (
              <span className="absolute right-0 top-4 z-10 flex flex-col gap-0.5 rounded-md border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                {(['simple', 'itemized', 'market'] as BillFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      printBill(txnToBillData(txn, customerName), shop, f);
                      setShowFormats(false);
                    }}
                    className="whitespace-nowrap rounded px-2 py-1 text-left text-[11px] hover:bg-[var(--bg-card)]"
                  >
                    {t(`billFormat${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
                    {f === defaultFormat ? ' ✓' : ''}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}
        <DeleteButton id={txn.id} />
      </div>
    </div>
  );
}
