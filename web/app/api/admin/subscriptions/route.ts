import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, AuthError } from '@/lib/auth';
import {
  getPlans,
  setPlans,
  getAllSubscriptionPayments,
  recordSubscriptionPayment,
  getSubscriptionSummary,
  getShopSubscriptionStatus,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET: list all subscription payments + summary + plans
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');

    if (shopId) {
      // Get subscription status for a specific shop
      const status = await getShopSubscriptionStatus(shopId);
      return NextResponse.json({ status });
    }

    const [payments, summary, plans] = await Promise.all([
      getAllSubscriptionPayments(),
      getSubscriptionSummary(),
      getPlans(),
    ]);
    return NextResponse.json({ payments, summary, plans });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Admin subscriptions GET error:', err.message);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

// POST: record a subscription payment or update plans
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth();
    const body = await request.json();
    const { action } = body;

    if (action === 'recordPayment') {
      const { shopId, amount, paymentMethod, paymentDate, plan, coversFrom, coversTo, notes } = body;
      if (!shopId || !amount || !plan || !coversFrom || !coversTo) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const result = await recordSubscriptionPayment(
        shopId,
        Number(amount),
        paymentMethod || 'cash',
        paymentDate || new Date().toISOString().slice(0, 10),
        plan,
        coversFrom,
        coversTo,
        notes,
        auth.email || auth.userId
      );
      return NextResponse.json({ ok: true, id: result.id });
    }

    if (action === 'updatePlans') {
      const { plans } = body;
      if (!Array.isArray(plans)) {
        return NextResponse.json({ error: 'plans must be an array' }, { status: 400 });
      }
      await setPlans(plans);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Admin subscriptions POST error:', err.message);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
