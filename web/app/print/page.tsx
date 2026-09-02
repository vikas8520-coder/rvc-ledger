'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { Customer } from '@/lib/types';
import {
  generateBillsPdf,
  generateCreditLedgerPdf,
  generateOutstandingListPdf,
  printPdfBlob,
} from '@/lib/pdfShare';
import {
  printDocket,
  printFarmerPatti,
  txnToBillData,
  type CreditLedgerEntry,
  type ShopProfile,
} from '@/lib/billPrint';
import { FileIcon, PrinterIcon, UsersIcon, DollarIcon, TruckIcon } from '../components/Icons';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PrintPage() {
  const { t, lang } = useI18n();
  const uiLang = getUiLang(lang);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shop, setShop] = useState<ShopProfile>({});
  const [status, setStatus] = useState('');
  const [docket, setDocket] = useState({
    date: today(),
    farmer: '',
    commodity: '',
    bags: '',
    weight: '',
    vehicleNo: '',
    destination: '',
    remark: '',
  });
  const [showDocket, setShowDocket] = useState(false);
  const [showPatti, setShowPatti] = useState(false);
  const [pattiDate, setPattiDate] = useState(today());
  const [pattiFarmer, setPattiFarmer] = useState('');
  const [pattiFarmers, setPattiFarmers] = useState<string[]>([]);
  const [pattiLoading, setPattiLoading] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []))
      .catch(() => {});
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        setShop({ shopName: s.shopName, shopAddress: s.shopAddress, shopPhone: s.shopPhone });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showPatti || !pattiDate) return;
    setPattiLoading(true);
    fetch(`/api/farmers?date=${encodeURIComponent(pattiDate)}`)
      .then((r) => r.json())
      .then((d) => {
        const names: string[] = d.farmers || [];
        setPattiFarmers(names);
        setPattiFarmer((cur) => (cur && names.includes(cur) ? cur : names[0] || ''));
      })
      .catch(() => setPattiFarmers([]))
      .finally(() => setPattiLoading(false));
  }, [showPatti, pattiDate]);

  const run = (label: string, fn: () => Blob) => {
    setStatus('');
    try {
      printPdfBlob(fn());
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : `Could not print ${label}`);
    }
  };

  const printDues = () =>
    run('dues', () => generateOutstandingListPdf(customers, shop, uiLang));

  const printLedger = () =>
    run('ledger', () => {
      const entries: CreditLedgerEntry[] = customers
        .filter((c) => c.due > 0)
        .sort((a, b) => formatCustomerName(a, uiLang).localeCompare(formatCustomerName(b, uiLang)))
        .map((c, i) => ({
          code: String(i + 1),
          name: formatCustomerName(c, uiLang),
          phone: c.phone || undefined,
          amount: Math.round(c.due),
          isCredit: false,
        }));
      const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      return generateCreditLedgerPdf(entries, shop, dateStr, 'All');
    });

  const printSavedPatti = async () => {
    setStatus('');
    if (!pattiFarmer.trim()) {
      setStatus('Pick a farmer who has sales on that date.');
      return;
    }
    try {
      const res = await fetch(
        `/api/farmers?date=${encodeURIComponent(pattiDate)}&farmer=${encodeURIComponent(pattiFarmer.trim())}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load patti');
      const p = data.patti;
      printFarmerPatti(
        {
          farmer: p.farmer,
          date: p.date,
          lines: p.lines,
          comm: p.comm,
          hamali: p.hamali,
          bardan: 0,
          freight: 0,
          advance: 0,
          packing: 0,
          other: 0,
        },
        shop,
      );
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : 'Could not print farmer patti');
    }
  };

  const printBills = () =>
    run('bills', () => {
      const allBills = customers.flatMap((c) =>
        c.txns
          .filter((tx) => tx.type === 'bill')
          .map((tx) => txnToBillData(tx, formatCustomerName(c, uiLang))),
      );
      if (allBills.length === 0) throw new Error('No customer bills yet');
      return generateBillsPdf(allBills, shop, 'patti');
    });

  const tiles = [
    {
      key: 'farmer',
      onClick: () => setShowPatti(true),
      icon: FileIcon,
      title: t('printFarmerPatti'),
      help: 'Reprint a saved farmer patti. Pick the date and farmer, then print.',
    },
    {
      key: 'bills',
      onClick: printBills,
      icon: PrinterIcon,
      title: t('printCustomerBills'),
      help: 'Customer sale slips, 6 to a page.',
    },
    {
      key: 'ledger',
      onClick: printLedger,
      icon: UsersIcon,
      title: t('printLedger'),
      help: 'Party-wise outstanding ledger.',
    },
    {
      key: 'dues',
      onClick: printDues,
      icon: DollarIcon,
      title: t('printDues'),
      help: 'Who still owes money.',
    },
    {
      key: 'docket',
      onClick: () => setShowDocket(true),
      icon: TruckIcon,
      title: t('printDocket'),
      help: 'Gate pass / loading slip.',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">{t('navPrint')}</h1>
        <p className="text-xs text-[var(--text-muted)]">{t('printHelp')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const body = (
            <>
              <Icon size={22} />
              <span className="mt-2 block text-sm font-semibold">{tile.title}</span>
              <span className="mt-1 block text-xs text-[var(--text-muted)]">{tile.help}</span>
            </>
          );
          const cls =
            'min-h-24 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 text-left hover:bg-[var(--bg-card-hover)]';
          return (
            <button key={tile.key} type="button" onClick={tile.onClick} className={cls}>
              {body}
            </button>
          );
        })}
      </div>

      {status && (
        <p className="rounded-lg bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--text-on-primary)]" role="alert">
          {status}
        </p>
      )}

      {showPatti && (
        <section className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold">{t('printFarmerPatti')}</h2>
          <p className="text-xs text-[var(--text-muted)]">
            This reprints sales already saved. Commission uses shop settings. Extra charges (bardan, freight) are not stored, so they print as 0.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('date')}</label>
              <input
                type="date"
                value={pattiDate}
                onChange={(e) => setPattiDate(e.target.value)}
                className="w-full min-h-11 rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-base sm:text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">{t('farmer')}</label>
              <select
                value={pattiFarmer}
                onChange={(e) => setPattiFarmer(e.target.value)}
                className="w-full min-h-11 rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-base sm:text-sm"
              >
                {pattiFarmers.length === 0 && <option value="">{pattiLoading ? t('loading') : 'No farmer sales this date'}</option>}
                {pattiFarmers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowPatti(false)} className="rounded-lg border border-[var(--border-input)] px-4 py-2 text-sm">
              {t('close')}
            </button>
            <button
              type="button"
              onClick={printSavedPatti}
              disabled={!pattiFarmer || pattiLoading}
              className="rounded-lg bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-on-primary)] disabled:opacity-40"
            >
              {t('print')}
            </button>
          </div>
        </section>
      )}

      {showDocket && (
        <section className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold">{t('printDocket')}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ['date', t('date'), 'date'],
                ['farmer', t('farmer'), 'text'],
                ['commodity', t('commodity'), 'text'],
                ['bags', t('qty'), 'text'],
                ['weight', t('weightKg'), 'text'],
                ['vehicleNo', t('vehicleNo'), 'text'],
                ['destination', 'To', 'text'],
                ['remark', t('notes'), 'text'],
              ] as const
            ).map(([field, label, type]) => (
              <div key={field} className={field === 'remark' || field === 'destination' ? 'col-span-2' : ''}>
                <label className="text-xs text-[var(--text-muted)]">{label}</label>
                <input
                  type={type}
                  value={docket[field]}
                  onChange={(e) => setDocket({ ...docket, [field]: e.target.value })}
                  className="w-full min-h-11 rounded-md border border-[var(--border-input)] bg-[var(--bg-base)] px-2 py-2 text-base sm:text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowDocket(false)} className="rounded-lg border border-[var(--border-input)] px-4 py-2 text-sm">
              {t('close')}
            </button>
            <button
              type="button"
              onClick={() => printDocket(docket, shop)}
              className="rounded-lg bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-on-primary)]"
            >
              {t('print')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
