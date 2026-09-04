'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser, UserButton, useClerk } from '@clerk/nextjs';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import { useI18n } from './I18nProvider';
import {
  HomeIcon, UsersIcon, ChartIcon,
  SettingsIcon, DollarIcon, MenuIcon, XIcon, FileIcon, LayersIcon, PrinterIcon, StoreIcon,
} from './Icons';

// Check if Clerk is configured at all (has publishable key)
const CLERK_CONFIGURED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Safe wrapper: provides no-op fallbacks when Clerk isn't configured
function useClerkSafe() {
  if (!CLERK_CONFIGURED) {
    return { isLoaded: true, user: null, signOut: () => {} };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const u = useUser();
  const c = useClerk();
  return { isLoaded: u.isLoaded, user: u.user, signOut: c.signOut };
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'navOverview', icon: HomeIcon },
  { href: '/customers', label: 'navCustomers', icon: UsersIcon },
  { href: '/farmers', label: 'navFarmers', icon: StoreIcon },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/reports', label: 'navReports', icon: ChartIcon },
  { href: '/misc', label: 'navMisc', icon: LayersIcon },
  { href: '/settings', label: 'settings', icon: SettingsIcon },
];

// Mobile bottom bar — daily work: patti, print, collect
const MOBILE_ACTIONS_OWNER: NavItem[] = [
  { href: '/', label: 'navOverview', icon: HomeIcon },
  { href: '/entry', label: 'navDataEntry', icon: FileIcon },
  { href: '/print', label: 'navPrint', icon: PrinterIcon },
  { href: '/payment', label: 'recordPayment', icon: DollarIcon },
];

// Data entry profile: only entry, print, payment
const MOBILE_ACTIONS_DATA_ENTRY: NavItem[] = [
  { href: '/entry', label: 'navDataEntry', icon: FileIcon },
  { href: '/print', label: 'navPrint', icon: PrinterIcon },
  { href: '/payment', label: 'recordPayment', icon: DollarIcon },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const { isLoaded, user, signOut } = useClerkSafe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<'owner' | 'data_entry'>('owner');
  const [authChecked, setAuthChecked] = useState(false);
  const [isDataEntryAuthed, setIsDataEntryAuthed] = useState(false);

  const isAuthPage = path === '/sign-in' || path === '/sign-up' || path === '/onboarding' || path === '/user-profile' || path === '/data-entry-login';
  const isAdminPage = path === '/admin' || path.startsWith('/admin/');

  useEffect(() => {
    if (isAuthPage || isAdminPage) return;
    // Always fetch /api/me — works for both Clerk users and data-entry cookie users
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) {
          if (d.profile) setUserProfile(d.profile);
          if (d.profile === 'data_entry') setIsDataEntryAuthed(true);
          // Only redirect to onboarding if no shopId AND not a data_entry user
          if (!d.shopId && d.role !== 'superadmin' && d.profile !== 'data_entry') {
            router.push('/onboarding');
          }
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, [isLoaded, user, isAuthPage, path, router]);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  if (isAdminPage || (isAuthPage && CLERK_CONFIGURED)) {
    return <>{children}</>;
  }

  const tabClass = (href: string, exact = false) => {
    const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
    return active
      ? 'bg-[var(--bg-primary)] text-[var(--text-on-primary)]'
      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]';
  };



  const renderNav = (items: NavItem[], isPrimary: boolean) => (
    items.map((item) => {
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${tabClass(item.href, item.href === '/')}`}
        >
          <Icon size={15} className="shrink-0" />
          <span className="truncate">{t(item.label)}</span>
        </Link>
      );
    })
  );

  const isDataEntry = userProfile === 'data_entry';
  const mobileActions = isDataEntry ? MOBILE_ACTIONS_DATA_ENTRY : MOBILE_ACTIONS_OWNER;

  const Shell = ({ children: shellChildren }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border-light)] bg-[var(--bg-base)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href={isDataEntry ? '/entry' : '/'} className="flex shrink-0 items-center gap-2 text-lg font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bg-primary)] text-xs font-bold text-[var(--text-on-primary)]">
                RVC
              </span>
              <span className="hidden sm:inline">{t('appTitle')}</span>
            </Link>
            {/* Desktop nav — owner only */}
            {!isDataEntry && (
              <nav className="hidden lg:flex gap-0.5 text-sm">
                {renderNav(PRIMARY_NAV, true)}
              </nav>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link
              href="/entry"
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]"
            >
              <FileIcon size={14} />
              {t('navDataEntry')}
            </Link>
            <Link
              href="/print"
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]"
            >
              <PrinterIcon size={14} />
              {t('navPrint')}
            </Link>
            <Link
              href="/payment"
              className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[var(--bg-success)] px-3 py-1.5 text-sm text-[var(--text-on-success)] hover:bg-[var(--bg-success-hover)]"
            >
              <DollarIcon size={14} />
              {t('recordPayment')}
            </Link>
            {/* Mobile menu toggle — owner only */}
            {!isDataEntry && (
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="lg:hidden flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] text-[var(--text-secondary)]"
                aria-label="Menu"
              >
                {menuOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
              </button>
            )}
            {CLERK_CONFIGURED && !isDataEntry && (
              <UserButton>
                <UserButton.MenuItems>
                  <UserButton.Link
                    href="/user-profile"
                    label="Change Password"
                    labelIcon={<SettingsIcon size={16} />}
                  />
                  <UserButton.Action label="manageAccount" />
                  <UserButton.Action label="signOut" />
                </UserButton.MenuItems>
              </UserButton>
            )}
            {isDataEntry && (
              <button
                onClick={async () => {
                  await fetch('/api/data-entry-logout', { method: 'POST' });
                  window.location.href = '/data-entry-login';
                }}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--border-input)] bg-[var(--bg-card)] text-[var(--text-secondary)]"
                aria-label="Logout"
                title="Logout"
              >
                <span className="text-xs font-semibold">Logout</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary desktop nav row — owner only */}
        {!isDataEntry && (
          <div className="hidden lg:block border-t border-[var(--border-light)]">
            <div className="mx-auto flex max-w-6xl items-center gap-0.5 px-3 py-1 sm:px-5">
              {renderNav(SECONDARY_NAV, false)}
            </div>
          </div>
        )}

        {/* Mobile dropdown menu — owner only */}
        {menuOpen && !isDataEntry && (
          <div className="lg:hidden border-t border-[var(--border-light)] bg-[var(--bg-base)]">
            <div className="mx-auto max-w-6xl px-3 py-3 sm:px-5 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] px-2.5 py-1">Main</p>
              {renderNav(PRIMARY_NAV, true)}
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] px-2.5 py-1 pt-3">More</p>
              {renderNav(SECONDARY_NAV, false)}
            </div>
          </div>
        )}
      </header>

      <div className={`mx-auto w-full max-w-6xl flex-1 px-3 py-3 sm:px-5 lg:pb-6 ${path === '/entry' ? 'pb-44' : 'pb-28'}`}>
        {shellChildren}
      </div>

      {/* Mobile bottom action bar */}
      <nav
        aria-label="Daily"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-light)] bg-[var(--bg-base)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="flex items-stretch justify-around">
          {mobileActions.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/' ? path === '/' : path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] leading-tight ${
                  active ? 'text-[var(--bg-primary)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Icon size={20} />
                <span className="max-w-full truncate">{t(item.label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );

  // If Clerk is not configured, show the app without auth
  if (!CLERK_CONFIGURED) {
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

  // Data-entry users are authed via cookie, not Clerk — let them through
  if (isDataEntryAuthed) {
    return <Shell>{children}</Shell>;
  }

  if (!user && authChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] gap-6 px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-primary)] px-3 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-on-primary)]">Shop Ledger</span>
          </div>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-primary)] text-lg font-bold text-[var(--text-on-primary)]">
            RVC
          </span>
          <h1 className="text-2xl font-bold text-[var(--bg-primary)]">RVC Ledger</h1>
          <p className="text-sm text-[var(--text-muted)]">Sign in to access your shop</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/sign-in" className="rounded-lg bg-[var(--bg-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-lg border border-[var(--bg-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--bg-primary)] hover:bg-[var(--bg-card)]">
            Sign up
          </Link>
        </div>

        <Link href="/data-entry-login" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline">
          Data Entry Login
        </Link>

      </div>
    );
  }

  return <Shell>{children}</Shell>;
}
