import { NextRequest, NextResponse } from 'next/server';
import { getPurchases, savePurchase } from '@/lib/db';
import { PurchaseData } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const purchases = await getPurchases();
    return NextResponse.json({ purchases });
  } catch (err: any) {
    console.error('Get purchases error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: PurchaseData = await request.json();
    if (!body.date || !body.items?.length) {
      return NextResponse.json({ error: 'Missing date or items' }, { status: 400 });
    }
    await savePurchase(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Save purchase error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
