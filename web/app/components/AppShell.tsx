'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LanguageSwitcher from './LanguageSwitcher';
import { useI18n } from './I18nProvider';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();

  const tabClass = (href: string, exact = false) => {
    const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
    return active
      ? 'bg-[#8b2e2e] text-white'
      : 'text-[#5a4a3a] hover:bg-[#e8e0d2]';
  };

  return (
    <div className="min-h-screen bg-[#f5f0e6] text-[#3a2f2f]">
      <header className="sticky top-0 z-10 border-b border-[#d9d0c2] bg-[#f5f0e6]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="shrink-0 text-lg font-bold">
              {t('appTitle')}
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link href="/" className={`rounded-md px-3 py-1.5 ${tabClass('/', true)}`}>
                {t('navOverview')}
              </Link>
              <Link href="/customers" className={`rounded-md px-3 py-1.5 ${tabClass('/customers')}`}>
                {t('navCustomers')}
              </Link>
              <Link href="/purchases" className={`rounded-md px-3 py-1.5 ${tabClass('/purchases')}`}>
                {t('navPurchases')}
              </Link>
              <Link href="/suppliers" className={`rounded-md px-3 py-1.5 ${tabClass('/suppliers')}`}>
                {t('navSuppliers')}
              </Link>
              <Link href="/wastage" className={`rounded-md px-3 py-1.5 ${tabClass('/wastage')}`}>
                {t('navWastage')}
              </Link>
              <Link href="/expenses" className={`rounded-md px-3 py-1.5 ${tabClass('/expenses')}`}>
                {t('navExpenses')}
              </Link>
              <Link href="/catalog" className={`rounded-md px-3 py-1.5 ${tabClass('/catalog')}`}>
                {t('navCatalog')}
              </Link>
              <Link href="/stock" className={`rounded-md px-3 py-1.5 ${tabClass('/stock')}`}>
                {t('navStock')}
              </Link>
              <Link href="/reports" className={`rounded-md px-3 py-1.5 ${tabClass('/reports')}`}>
                {t('navReports')}
              </Link>
              <Link href="/settings" className={`rounded-md px-3 py-1.5 ${tabClass('/settings')}`}>
                {t('settings')}
              </Link>
            </nav>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher />
            <Link
              href="/quick-bill"
              className="rounded-md bg-[#5a4a3a] px-3 py-1.5 text-sm text-white hover:bg-[#4a3a2a]"
            >
              {t('quickBill')}
            </Link>
            <Link
              href="/payment"
              className="rounded-md bg-[#2d6b4f] px-3 py-1.5 text-sm text-white hover:bg-[#22513a]"
            >
              {t('recordPayment')}
            </Link>
            <Link
              href="/upload"
              className="rounded-md bg-[#8b2e2e] px-3 py-1.5 text-sm text-white hover:bg-[#6b2222]"
            >
              {t('uploadBill')}
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5">{children}</div>
    </div>
  );
}
