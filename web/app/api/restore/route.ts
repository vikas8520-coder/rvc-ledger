import { NextRequest, NextResponse } from 'next/server';
import { restoreAllData, isDbConfigured } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid backup file' }, { status: 400 });
    }
    // Validate structure
    const required = ['customers', 'transactions', 'billItems'];
    for (const k of required) {
      if (!Array.isArray(body[k])) {
        return NextResponse.json({ error: `Invalid backup: missing or invalid ${k}` }, { status: 400 });
      }
    }
    const result = await restoreAllData(auth.shopId!, body);
    return NextResponse.json({ ok: true, restored: result.restored });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Restore error:', err);
    return NextResponse.json({ error: err.message || 'Restore failed' }, { status: 500 });
  }
}
