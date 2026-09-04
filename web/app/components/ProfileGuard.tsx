'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirects data-entry users to /entry if they try to access an owner-only page.
 * Usage: wrap owner-only page content with <ProfileGuard>...</ProfileGuard>
 */
export default function ProfileGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.profile === 'data_entry') {
          router.replace('/entry');
        } else {
          setChecked(true);
        }
      })
      .catch(() => setChecked(true));
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-[var(--text-faint)]">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
