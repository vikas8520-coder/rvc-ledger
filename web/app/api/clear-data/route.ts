import { NextRequest, NextResponse } from 'next/server';
import { clearDataBefore, clearAllData, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }
    const body = await request.json();
    const { mode, date, confirm } = body;
    if (!confirm) {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
    }
    if (mode === 'before') {
      if (!date) {
        return NextResponse.json({ error: 'Date required for before-date mode' }, { status: 400 });
      }
      const result = await clearDataBefore(date);
      return NextResponse.json({ ok: true, deleted: result.deleted });
    } else if (mode === 'all') {
      const result = await clearAllData();
      return NextResponse.json({ ok: true, deleted: result.deleted });
    } else {
      return NextResponse.json({ error: 'Invalid mode. Use "before" or "all".' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Clear data error:', err);
    return NextResponse.json({ error: err.message || 'Clear failed' }, { status: 500 });
  }
}
