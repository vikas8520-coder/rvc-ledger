import { NextResponse } from 'next/server';
import { getCustomers, isDbConfigured } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    console.log('Dashboard auth:', { shopId: auth.shopId, role: auth.role, userId: auth.userId });
    const customers = await getCustomers(auth.shopId!);
    console.log('Dashboard customers:', customers.length);
    return NextResponse.json({ customers, configured: isDbConfigured() });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Dashboard error:', err.message, err.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
