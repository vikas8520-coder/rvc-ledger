import { NextRequest, NextResponse } from 'next/server';
import { validateAdminLogin, setAdminCookie, isAdminLoginConfigured } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    if (!isAdminLoginConfigured()) {
      return NextResponse.json({ error: 'Admin login not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD env vars.' }, { status: 500 });
    }

    if (!validateAdminLogin(username, password)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await setAdminCookie();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Login failed' }, { status: 500 });
  }
}
