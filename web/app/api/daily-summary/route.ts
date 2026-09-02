import { NextRequest, NextResponse } from 'next/server';
import { getDailySummary, istToday } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || istToday();
    const summary = await getDailySummary(auth.shopId!, date);
    return NextResponse.json(summary);
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
