import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, AuthError } from '@/lib/auth';
import {
  getPlans,
  setPlans,
  getAllSubscriptionPayments,
  recordSubscriptionPayment,
  getSubscriptionSummary,
  getShopSubscriptionStatus,
  setShopBillingStatus,
  setShopTrialEnd,
  extendSubscription,
  getMonthlyRevenue,
  istToday,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET: list all subscription payments + summary + plans + revenue
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth();
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');
    const exportCsv = searchParams.get('export') === 'csv';

    if (shopId) {
      const status = await getShopSubscriptionStatus(shopId);
      return NextResponse.json({ status });
    }

    const [payments, summary, plans, monthlyRevenue] = await Promise.all([
      getAllSubscriptionPayments(),
      getSubscriptionSummary(),
      getPlans(),
      getMonthlyRevenue(),
    ]);

    if (exportCsv) {
      const csv = generatePaymentsCsv(payments);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="subscription-payments.csv"',
        },
      });
    }

    return NextResponse.json({ payments, summary, plans, monthlyRevenue });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Admin subscriptions GET error:', err.message);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

// POST: record payment, update plans, extend, suspend, set trial
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
        paymentDate || istToday(),
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

    if (action === 'extend') {
      const { shopId, days } = body;
      if (!shopId || !days) {
        return NextResponse.json({ error: 'shopId and days required' }, { status: 400 });
      }
      const result = await extendSubscription(shopId, Number(days));
      return NextResponse.json({ ok: true, newCoversTo: result.newCoversTo });
    }

    if (action === 'suspend') {
      const { shopId } = body;
      if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });
      await setShopBillingStatus(shopId, 'suspended');
      return NextResponse.json({ ok: true });
    }

    if (action === 'unsuspend') {
      const { shopId } = body;
      if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });
      await setShopBillingStatus(shopId, 'active');
      return NextResponse.json({ ok: true });
    }

    if (action === 'setTrial') {
      const { shopId, trialEnds } = body;
      if (!shopId) return NextResponse.json({ error: 'shopId required' }, { status: 400 });
      await setShopTrialEnd(shopId, trialEnds || null);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Admin subscriptions POST error:', err.message);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

function generatePaymentsCsv(payments: any[]): string {
  const headers = ['Date', 'Shop', 'Plan', 'Amount', 'Method', 'Coverage From', 'Coverage To', 'Notes', 'Recorded By'];
  const rows = payments.map((p) => [
    p.payment_date,
    `"${p.shop_name}"`,
    p.plan,
    p.amount,
    p.payment_method,
    p.covers_from,
    p.covers_to,
    `"${p.notes || ''}"`,
    `"${p.recorded_by || ''}"`,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
