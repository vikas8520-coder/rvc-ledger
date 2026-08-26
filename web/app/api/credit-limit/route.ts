import { NextRequest, NextResponse } from 'next/server';
import { setCustomerCreditLimit } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.customerId) {
      return NextResponse.json({ error: 'Missing customerId' }, { status: 400 });
    }
    await setCustomerCreditLimit(body.customerId, body.limit ? Number(body.limit) : null);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Set credit limit error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
