import { NextRequest, NextResponse } from 'next/server';
import { getAllSettings, setSetting, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json({ settings: {} });
    }
    const settings = await getAllSettings();
    return NextResponse.json({ settings });
  } catch (err: any) {
    console.error('Get settings error:', err);
    return NextResponse.json({ settings: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }
    await setSetting(key, value ?? '');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Set setting error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
