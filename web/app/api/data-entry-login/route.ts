import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setDataEntryCookie, clearAdminCookie } from '@/lib/auth';
import { verifyDataEntryPassword, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST — verify password and set data-entry session cookie
export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    if (!isDbConfigured()) {
      console.error('Data-entry login: DB not configured');
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const shopId = await verifyDataEntryPassword(password);
    if (!shopId) {
      console.error('Data-entry login: no shop matched for provided password');
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Clear admin cookie (mutual exclusion)
    await clearAdminCookie();

    // Clear Clerk session cookie by setting it to expire immediately
    // Clerk uses __clerk_db_jwt and __clerk_jwt cookies
    const cookieStore = await cookies();
    for (const name of ['__clerk_db_jwt', '__clerk_jwt', '__client_uat']) {
      cookieStore.set(name, '', { maxAge: 0, path: '/' });
    }

    await setDataEntryCookie(shopId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Data-entry login error:', e);
    return NextResponse.json({ error: e?.message || 'Login failed' }, { status: 500 });
  }
}
