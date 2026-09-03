import { NextRequest, NextResponse } from 'next/server';
import { saveRate, getRecentRates, getLatestRate } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const commodity = searchParams.get('commodity');
    const latest = searchParams.get('latest') === 'true';
    if (!commodity) {
      return NextResponse.json({ error: 'Missing commodity parameter' }, { status: 400 });
    }
    if (latest) {
      const rate = await getLatestRate(auth.shopId!, commodity);
      return NextResponse.json({ rate });
    }
    const rates = await getRecentRates(auth.shopId!, commodity);
    return NextResponse.json({ rates });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get rates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    const { commodity, rate, rateUnit, date } = body;
    if (!commodity?.trim() || !rate || !date) {
      return NextResponse.json({ error: 'Missing commodity, rate, or date' }, { status: 400 });
    }
    await saveRate(auth.shopId!, commodity.trim(), parseFloat(rate), rateUnit || 'per_kg', date);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save rate error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
