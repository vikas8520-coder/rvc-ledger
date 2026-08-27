import { NextRequest, NextResponse } from 'next/server';
import { getPurchases, savePurchase } from '@/lib/db';
import { PurchaseData } from '@/lib/types';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const purchases = await getPurchases(auth.shopId!);
    return NextResponse.json({ purchases });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get purchases error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body: PurchaseData = await request.json();
    if (!body.date || !body.items?.length) {
      return NextResponse.json({ error: 'Missing date or items' }, { status: 400 });
    }
    await savePurchase(auth.shopId!, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save purchase error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
