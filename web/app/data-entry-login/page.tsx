'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to the main sign-in page (which now has the Data Entry tab)
export default function DataEntryLoginPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/sign-in');
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
      <p className="text-sm text-[var(--text-faint)]">Redirecting…</p>
    </div>
  );
}
