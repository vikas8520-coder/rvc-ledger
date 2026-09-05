import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setDataEntryCookie, clearAdminCookie } from '@/lib/auth';
import { verifyDataEntryPassword, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST — verify shop number + password and set data-entry session cookie
export async function POST(req: Request) {
  try {
    const { shopNumber, password } = await req.json();
    if (!shopNumber || typeof shopNumber !== 'string') {
      return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    if (!isDbConfigured()) {
      console.error('Data-entry login: DB not configured');
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const shopId = await verifyDataEntryPassword(shopNumber, password);
    if (!shopId) {
      console.error('Data-entry login: no shop matched for shop number:', shopNumber);
      return NextResponse.json({ error: 'Invalid Shop ID or Password' }, { status: 401 });
    }

    // Clear admin cookie (mutual exclusion)
    await clearAdminCookie();

    // Clear Clerk session cookie by setting it to expire immediately
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
