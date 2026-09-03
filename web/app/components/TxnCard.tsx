'use client';

import { useState } from 'react';
import { Customer } from '@/lib/types';
import { localizeName } from '@/lib/catalog';
import { yardById } from '@/lib/market';
import { fmt, fmtDate, fmtTime } from '@/lib/format';
import { getUiLang } from '@/lib/i18n';
import { useI18n } from './I18nProvider';
import DeleteButton from './DeleteButton';
import { printBill, txnToBillData, BillFormat, ShopProfile } from '@/lib/billPrint';
import { generateBillsPdf, sharePdfViaWhatsApp } from '@/lib/pdfShare';

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
            {fmtDate(txn.date)}{fmtTime(txn.createdAt) ? ` · ${fmtTime(txn.createdAt)}` : ''}
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
              className="text-[var(--bg-primary)] hover:bg-[var(--bg-base)] rounded p-0.5"
              title={t('printShare')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'middle'}}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            {showFormats && (
              <span className="absolute right-0 top-4 z-10 flex max-w-[min(12rem,90vw)] flex-col gap-0.5 rounded-md border border-[var(--border-light)] bg-[var(--bg-input)] p-1 shadow-lg">
                {(['simple', 'itemized', 'market', 'patti'] as BillFormat[]).map((f) => (
                  <div key={f} className="flex gap-0.5">
                    <button
                      onClick={() => {
                        printBill(txnToBillData(txn, customerName), shop, f);
                        setShowFormats(false);
                      }}
                      className="flex-1 whitespace-nowrap rounded px-2 py-1 text-left text-[11px] hover:bg-[var(--bg-card)]"
                    >
                      🖨 {t(`billFormat${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
                    </button>
                    <button
                      onClick={async () => {
                        const bill = txnToBillData(txn, customerName);
                        const pdfFormat = (f === 'market' ? 'itemized' : f) as 'simple' | 'itemized' | 'patti';
                        const blob = generateBillsPdf([bill], shop, pdfFormat);
                        const filename = `${f}-${txn.id}.pdf`;
                        const text = `${shop.shopName || 'RVC'} — ${customerName} — ₹${txn.amount}`;
                        await sharePdfViaWhatsApp(blob, filename, text);
                        setShowFormats(false);
                      }}
                      className="whitespace-nowrap rounded px-2 py-1 text-left text-[11px] hover:bg-[var(--bg-card)]"
                      style={{color:'#25D366'}}
                    >
                      WA
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setShowFormats(false)}
                  className="whitespace-nowrap rounded px-2 py-1 text-left text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-card)]"
                >
                  ✕ Cancel
                </button>
              </span>
            )}
          </span>
        )}
        <DeleteButton id={txn.id} />
      </div>
    </div>
  );
}
