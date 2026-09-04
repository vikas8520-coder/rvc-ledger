import { NextResponse } from 'next/server';
import { setDataEntryCookie } from '@/lib/auth';
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

    await setDataEntryCookie(shopId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Data-entry login error:', e);
    return NextResponse.json({ error: e?.message || 'Login failed' }, { status: 500 });
  }
}
