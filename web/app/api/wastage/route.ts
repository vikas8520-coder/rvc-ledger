import { NextRequest, NextResponse } from 'next/server';
import { getWastage, saveWastage } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const entries = await getWastage(auth.shopId!);
    return NextResponse.json({ entries });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get wastage error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    if (!body.date || !body.itemName) {
      return NextResponse.json({ error: 'Missing date or itemName' }, { status: 400 });
    }
    await saveWastage(auth.shopId!, {
      date: body.date,
      itemName: body.itemName,
      qty: body.qty || null,
      unit: body.unit || null,
      reason: body.reason || '',
      estCost: Number(body.estCost) || 0,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save wastage error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
