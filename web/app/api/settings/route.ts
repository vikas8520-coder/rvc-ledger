import { NextRequest, NextResponse } from 'next/server';
import { getAllSettings, setSetting, isDbConfigured } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    if (!isDbConfigured()) {
      return NextResponse.json({ settings: {} });
    }
    const settings = await getAllSettings(auth.shopId!);
    return NextResponse.json({ settings });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get settings error:', err);
    return NextResponse.json({ settings: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    const { key, value } = body;
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }
    await setSetting(auth.shopId!, key, value ?? '');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Set setting error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
