import { NextResponse } from 'next/server';
import { clearDataEntryCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST — clear data-entry session cookie
export async function POST() {
  await clearDataEntryCookie();
  return NextResponse.json({ success: true });
}
