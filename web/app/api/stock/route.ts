import { NextResponse } from 'next/server';
import { getStock } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const stock = await getStock(auth.shopId!);
    return NextResponse.json({ stock });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get stock error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
