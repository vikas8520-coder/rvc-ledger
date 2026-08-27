import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import { getAllShops, setShopBillingStatus, setShopActive, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminAuth();
    if (!isDbConfigured()) {
      return NextResponse.json({ shops: [] });
    }
    const shops = await getAllShops();
    return NextResponse.json({ shops });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json({ error: err.message || 'Failed' }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth();
    const body = await request.json();
    const { shopId, action, status } = body;

    if (!shopId) {
      return NextResponse.json({ error: 'Missing shopId' }, { status: 400 });
    }

    if (action === 'toggleActive') {
      // Get current state
      const shops = await getAllShops();
      const shop = shops.find((s: any) => s.id === shopId);
      if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
      await setShopActive(shopId, !shop.active);
      return NextResponse.json({ ok: true, active: !shop.active });
    }

    if (action === 'setBilling') {
      if (!status) return NextResponse.json({ error: 'Missing status' }, { status: 400 });
      await setShopBillingStatus(shopId, status);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json({ error: err.message || 'Failed' }, { status });
  }
}
