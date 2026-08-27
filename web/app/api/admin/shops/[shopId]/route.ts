import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import { getShopById, getCustomers, getPurchases, getExpenses, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    await requireAdminAuth();
    const { shopId } = await params;
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }
    const shop = await getShopById(shopId);
    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    const [customers, purchases, expenses] = await Promise.all([
      getCustomers(shopId),
      getPurchases(shopId),
      getExpenses(shopId),
    ]);
    return NextResponse.json({
      shop,
      customers: customers.length,
      purchases: purchases.length,
      expenses: expenses.length,
      totalBilled: customers.reduce((s, c) => s + c.billed, 0),
      totalPaid: customers.reduce((s, c) => s + c.paid, 0),
      totalDue: customers.reduce((s, c) => s + c.due, 0),
    });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json({ error: err.message || 'Failed' }, { status });
  }
}
