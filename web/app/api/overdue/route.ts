import { NextRequest, NextResponse } from 'next/server';
import { getOverdueCustomers } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const minDays = parseInt(searchParams.get('minDays') || '1', 10);
    const overdue = await getOverdueCustomers(auth.shopId!, minDays);
    return NextResponse.json({ overdue });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
