'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser, UserButton, useClerk } from '@clerk/nextjs';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import { useI18n } from './I18nProvider';

// Check if Clerk production keys are configured (determined at build time)
const CLERK_PRODUCTION = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').startsWith('pk_live_');

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [authState, setAuthState] = useState<{ role: string; shopId: string | null } | null>(null);

  // Don't show shell on auth pages
  const isAuthPage = path === '/sign-in' || path === '/sign-up' || path === '/onboarding';

  useEffect(() => {
    if (!CLERK_PRODUCTION || !isLoaded || !user || isAuthPage) return;
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (!d.authenticated) return;
        if (!d.shopId && d.role !== 'superadmin') {
          router.push('/onboarding');
        }
        setAuthState({ role: d.role, shopId: d.shopId });
      })
      .catch(() => {});
  }, [isLoaded, user, isAuthPage, path, router]);

  // Show minimal layout for auth pages
  if (isAuthPage && CLERK_PRODUCTION) {
    return <>{children}</>;
  }

  // If Clerk production is not configured, show the app without auth
  if (!CLERK_PRODUCTION) {
    const tabClass = (href: string, exact = false) => {
      const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
      return active
        ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]';
    };

    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
        <header className="sticky top-0 z-10 border-b border-[var(--border-light)] bg-[var(--bg-base)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="shrink-0 text-lg font-bold">
                {t('appTitle')}
              </Link>
              <nav className="flex gap-1 text-sm">
                <Link href="/" className={`rounded-md px-3 py-1.5 ${tabClass('/', true)}`}>
                  {t('navOverview')}
                </Link>
                <Link href="/daily" className={`rounded-md px-3 py-1.5 ${tabClass('/daily')}`}>
                  {t('dailyOps')}
                </Link>
                <Link href="/rates" className={`rounded-md px-3 py-1.5 ${tabClass('/rates')}`}>
                  {t('rateSheet')}
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
              <ThemeToggle />
              <Link
                href="/quick-bill"
                className="rounded-md bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]"
              >
                {t('quickBill')}
              </Link>
              <Link
                href="/payment"
                className="rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-success-hover)]"
              >
                {t('recordPayment')}
              </Link>
              <Link
                href="/upload"
                className="rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
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

  // Show loading or sign-in prompt if not loaded
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <p className="text-sm text-[var(--text-faint)]">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] gap-4">
        <h1 className="text-2xl font-bold text-[var(--bg-primary)]">RVC Ledger</h1>
        <p className="text-sm text-[var(--text-muted)]">Sign in to access your shop ledger</p>
        <div className="flex gap-3">
          <Link href="/sign-in" className="rounded-md bg-[var(--bg-primary)] px-5 py-2 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-md border border-[var(--bg-primary)] px-5 py-2 text-sm font-semibold text-[var(--bg-primary)] hover:bg-[var(--bg-card)]">
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  const tabClass = (href: string, exact = false) => {
    const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
    return active
      ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]';
  };

  // Superadmin sees normal nav + admin link
  const isAdmin = authState?.role === 'superadmin';

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border-light)] bg-[var(--bg-base)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="shrink-0 text-lg font-bold">
              {t('appTitle')}
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link href="/" className={`rounded-md px-3 py-1.5 ${tabClass('/', true)}`}>
                {t('navOverview')}
              </Link>
              <Link href="/daily" className={`rounded-md px-3 py-1.5 ${tabClass('/daily')}`}>
                {t('dailyOps')}
              </Link>
              <Link href="/rates" className={`rounded-md px-3 py-1.5 ${tabClass('/rates')}`}>
                {t('rateSheet')}
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
              {isAdmin && (
                <Link href="/admin" className={`rounded-md px-3 py-1.5 ${tabClass('/admin')}`}>
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link
              href="/quick-bill"
              className="rounded-md bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]"
            >
              {t('quickBill')}
            </Link>
            <Link
              href="/payment"
              className="rounded-md bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-success-hover)]"
            >
              {t('recordPayment')}
            </Link>
            <Link
              href="/upload"
              className="rounded-md bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
            >
              {t('uploadBill')}
            </Link>
            <UserButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5">{children}</div>
    </div>
  );
}
