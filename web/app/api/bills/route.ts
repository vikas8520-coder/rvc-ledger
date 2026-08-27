import { NextRequest, NextResponse } from 'next/server';
import { saveBill } from '@/lib/db';
import { BillData } from '@/lib/types';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body: BillData = await request.json();
    if (!body.customerName || !body.date || !body.items?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    await saveBill(auth.shopId!, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save bill error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
