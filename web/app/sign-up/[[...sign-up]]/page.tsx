import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Shop signup header — distinct from admin */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-primary)] px-3 py-1 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-on-primary)]">Shop Ledger</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--bg-primary)]">RVC Ledger</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Create your shop account</p>
        </div>

        <SignUp appearance={{
          elements: {
            rootBox: 'mx-auto w-full',
            card: 'bg-[var(--bg-input)] shadow-lg rounded-xl border border-[var(--border-light)]',
            headerTitle: 'text-[var(--bg-primary)]',
            headerSubtitle: 'text-[var(--text-muted)]',
            socialButtonsBlockButton: 'border-[var(--border-light)]',
            formButtonPrimary: 'bg-[var(--bg-primary)] hover:bg-[var(--bg-primary-hover)] text-[var(--text-on-primary)]',
            footerActionLink: 'text-[var(--bg-primary)] hover:text-[var(--bg-primary-hover)]',
          },
        }} />

        <p className="mt-6 text-center text-[11px] text-[var(--text-faint)]">
          Are you the superadmin?{' '}
          <a href="/admin/login" className="font-medium text-[var(--text-muted)] underline">Admin login →</a>
        </p>
      </div>
    </div>
  );
}
