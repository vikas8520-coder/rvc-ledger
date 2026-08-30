import { NextResponse } from 'next/server';
import { clearAdminCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  await clearAdminCookie();
  return NextResponse.json({ ok: true });
}
