'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser, UserButton, useClerk } from '@clerk/nextjs';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import { useI18n } from './I18nProvider';
import {
  HomeIcon, UsersIcon, TruckIcon, StoreIcon, PackageIcon, ChartIcon,
  SettingsIcon, CalendarIcon, TrendingIcon, CameraIcon, PlusIcon,
  DollarIcon, MenuIcon, XIcon, FileIcon, BoxIcon, LayersIcon,
} from './Icons';

// Check if Clerk production keys are configured (determined at build time)
const CLERK_PRODUCTION = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').startsWith('pk_live_');

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'navOverview', icon: HomeIcon },
  { href: '/daily', label: 'dailyOps', icon: CalendarIcon },
  { href: '/rates', label: 'rateSheet', icon: TrendingIcon },
  { href: '/customers', label: 'navCustomers', icon: UsersIcon },
  { href: '/purchases', label: 'navPurchases', icon: TruckIcon },
  { href: '/suppliers', label: 'navSuppliers', icon: StoreIcon },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/stock', label: 'navStock', icon: BoxIcon },
  { href: '/wastage', label: 'navWastage', icon: PackageIcon },
  { href: '/expenses', label: 'navExpenses', icon: DollarIcon },
  { href: '/catalog', label: 'navCatalog', icon: LayersIcon },
  { href: '/reports', label: 'navReports', icon: ChartIcon },
  { href: '/settings', label: 'settings', icon: SettingsIcon },
];

// Mobile bottom bar — 3 clear actions
const MOBILE_ACTIONS: NavItem[] = [
  { href: '/receive', label: 'receiveStock', icon: TruckIcon },
  { href: '/sell', label: 'sell', icon: StoreIcon },
  { href: '/payment', label: 'recordPayment', icon: DollarIcon },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [authState, setAuthState] = useState<{ role: string; shopId: string | null } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  if (isAuthPage && CLERK_PRODUCTION) {
    return <>{children}</>;
  }

  const tabClass = (href: string, exact = false) => {
    const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
    return active
      ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]';
  };

  const isAdmin = authState?.role === 'superadmin';
  const allNav = [...PRIMARY_NAV, ...SECONDARY_NAV];

  const renderNav = (items: NavItem[], isPrimary: boolean) => (
    items.map((item) => {
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${tabClass(item.href, item.href === '/')}`}
        >
          <Icon size={15} className="shrink-0" />
          <span className="truncate">{t(item.label)}</span>
        </Link>
      );
    })
  );

  const Shell = ({ children: shellChildren }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--border-light)] bg-[var(--bg-base)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bg-primary)] text-xs font-bold text-[var(--text-on-primary)]">
                RVC
              </span>
              <span className="hidden sm:inline">{t('appTitle')}</span>
            </Link>
            {/* Desktop nav */}
            <nav className="hidden lg:flex gap-0.5 text-sm">
              {renderNav(PRIMARY_NAV, true)}
            </nav>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
            {/* Desktop action buttons */}
            <Link
              href="/quick-bill"
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]"
            >
              <PlusIcon size={14} />
              {t('quickBill')}
            </Link>
            <Link
              href="/payment"
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-success)] hover:bg-[var(--bg-success-hover)]"
            >
              <DollarIcon size={14} />
              {t('recordPayment')}
            </Link>
            <Link
              href="/upload"
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
            >
              <CameraIcon size={14} />
              {t('uploadBill')}
            </Link>
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] p-1.5 text-[var(--text-secondary)]"
              aria-label="Menu"
            >
              {menuOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
            </button>
            {CLERK_PRODUCTION && <UserButton />}
          </div>
        </div>

        {/* Secondary desktop nav row */}
        <div className="hidden lg:block border-t border-[var(--border-light)]">
          <div className="mx-auto flex max-w-6xl items-center gap-0.5 px-3 py-1 sm:px-5">
            {renderNav(SECONDARY_NAV, false)}
            {isAdmin && (
              <Link href="/admin" className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${tabClass('/admin')}`}>
                <SettingsIcon size={15} />
                Admin
              </Link>
            )}
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="lg:hidden border-t border-[var(--border-light)] bg-[var(--bg-base)]">
            <div className="mx-auto max-w-6xl px-3 py-3 sm:px-5 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] px-2.5 py-1">Main</p>
              {renderNav(PRIMARY_NAV, true)}
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] px-2.5 py-1 pt-3">More</p>
              {renderNav(SECONDARY_NAV, false)}
              {isAdmin && (
                <Link href="/admin" className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${tabClass('/admin')}`}>
                  <SettingsIcon size={15} />
                  Admin
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-5 pb-20 lg:pb-4">
        {shellChildren}
      </div>

      {/* Mobile bottom action bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border-light)] bg-[var(--bg-base)]/95 backdrop-blur">
        <div className="flex items-center justify-around px-2 py-1.5">
          {MOBILE_ACTIONS.map((item) => {
            const Icon = item.icon;
            const active = path === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] ${
                  active ? 'text-[var(--bg-primary)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Icon size={20} />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );

  // If Clerk production is not configured, show the app without auth
  if (!CLERK_PRODUCTION) {
    return <Shell>{children}</Shell>;
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-primary)] text-sm font-bold text-[var(--text-on-primary)] animate-pulse">
            RVC
          </span>
          <p className="text-sm text-[var(--text-faint)]">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] gap-6 px-4">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-primary)] text-lg font-bold text-[var(--text-on-primary)]">
            RVC
          </span>
          <h1 className="text-2xl font-bold text-[var(--bg-primary)]">RVC Ledger</h1>
          <p className="text-sm text-[var(--text-muted)]">Sign in to access your shop ledger</p>
        </div>
        <div className="flex gap-3">
          <Link href="/sign-in" className="rounded-lg bg-[var(--bg-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-lg border border-[var(--bg-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--bg-primary)] hover:bg-[var(--bg-card)]">
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return <Shell>{children}</Shell>;
}
