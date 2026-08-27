import { NextResponse } from 'next/server';
import { getCustomerNames } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const names = await getCustomerNames(auth.shopId!);
    return NextResponse.json({ names });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get customers error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
