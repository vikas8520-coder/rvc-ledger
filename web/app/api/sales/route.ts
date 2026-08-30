import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { getDaySales } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });
    const lines = await getDaySales(auth.shopId!, date);
    return NextResponse.json({ lines });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get sales error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
