'use client';

import { UserProfile } from '@clerk/nextjs';

export default function UserProfilePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-primary)] px-3 py-1 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-on-primary)]">Shop Ledger</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--bg-primary)]">Account Settings</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Change your password, manage your account</p>
        </div>

        <UserProfile
          appearance={{
            elements: {
              rootBox: 'mx-auto w-full',
              card: 'bg-[var(--bg-input)] shadow-lg rounded-xl border border-[var(--border-light)]',
              navbar: 'bg-[var(--bg-card)]',
              navbarButton: 'text-[var(--text-primary)]',
              profileSectionTitle: 'text-[var(--bg-primary)]',
              profileSectionContent: 'bg-[var(--bg-input)]',
              formButtonPrimary: 'bg-[var(--bg-primary)] hover:bg-[var(--bg-primary-hover)] text-[var(--text-on-primary)]',
              formFieldInput: 'bg-[var(--bg-base)] border-[var(--border-input)]',
              footerActionLink: 'text-[var(--bg-primary)] hover:text-[var(--bg-primary-hover)]',
            },
          }}
        />

        <p className="mt-6 text-center text-[11px] text-[var(--text-faint)]">
          <a href="/" className="font-medium text-[var(--text-muted)] underline">← Back to app</a>
        </p>
      </div>
    </div>
  );
}
