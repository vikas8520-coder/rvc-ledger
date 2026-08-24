import { NextRequest, NextResponse } from 'next/server';
import { recordPayment } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.customerName || !body.date || !body.amount || Number(body.amount) <= 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    await recordPayment(body.customerName, body.date, Number(body.amount), body.notes || '');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Record payment error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
