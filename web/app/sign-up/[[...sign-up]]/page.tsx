import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4">
      <SignUp appearance={{
        elements: {
          rootBox: 'mx-auto',
          card: 'bg-[var(--bg-input)] shadow-lg rounded-xl border border-[var(--border-light)]',
          headerTitle: 'text-[var(--bg-primary)]',
          headerSubtitle: 'text-[var(--text-muted)]',
          socialButtonsBlockButton: 'border-[var(--border-light)]',
          formButtonPrimary: 'bg-[var(--bg-primary)] hover:bg-[var(--bg-primary-hover)] text-[var(--text-on-primary)]',
          footerActionLink: 'text-[var(--bg-primary)] hover:text-[var(--bg-primary-hover)]',
        },
      }} />
    </div>
  );
}
