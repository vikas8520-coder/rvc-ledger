import { NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { getShopSubscriptionStatus, getShopSubscriptionPayments, getPlans } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET: shop's own subscription status + payment history
export async function GET() {
  try {
    const auth = await requireShopAuth();
    const [status, payments, plans] = await Promise.all([
      getShopSubscriptionStatus(auth.shopId!),
      getShopSubscriptionPayments(auth.shopId!),
      getPlans(),
    ]);
    return NextResponse.json({ status, payments, plans });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Subscription status error:', err.message);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
