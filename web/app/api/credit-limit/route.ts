import { NextRequest, NextResponse } from 'next/server';
import { setCustomerCreditLimit } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    if (!body.customerId) {
      return NextResponse.json({ error: 'Missing customerId' }, { status: 400 });
    }
    await setCustomerCreditLimit(auth.shopId!, body.customerId, body.limit ? Number(body.limit) : null);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Set credit limit error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
