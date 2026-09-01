'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../components/I18nProvider';
import { formatCustomerName, getUiLang } from '@/lib/i18n';
import { Customer } from '@/lib/types';
import {
  generateBillsPdf,
  generateCreditLedgerPdf,
  generateOutstandingListPdf,
  printPdfBlob,
} from '@/lib/pdfShare';
import { printDocket, txnToBillData, type CreditLedgerEntry, type ShopProfile } from '@/lib/billPrint';
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
      href: '/entry',
      icon: FileIcon,
      title: t('printFarmerPatti'),
      help: 'Open Data Entry, then Print patti for the farmer on screen.',
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
          if (tile.href) {
            return (
              <Link key={tile.key} href={tile.href} className={cls}>
                {body}
              </Link>
            );
          }
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
