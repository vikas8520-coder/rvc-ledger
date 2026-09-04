import { NextResponse } from 'next/server';
import { setDataEntryCookie } from '@/lib/auth';
import { verifyDataEntryPassword } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST — verify password and set data-entry session cookie
export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const shopId = await verifyDataEntryPassword(password);
    if (!shopId) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    await setDataEntryCookie(shopId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Data-entry login error:', e);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
