import { NextRequest, NextResponse } from 'next/server';
import { getSuppliers, recordSupplierPayment, createSupplier } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const suppliers = await getSuppliers(auth.shopId!);
    return NextResponse.json({ suppliers, shopId: auth.shopId, profile: auth.profile });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get suppliers error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();

    // Create a new supplier/farmer
    if (body.action === 'create') {
      if (!body.name) {
        return NextResponse.json({ error: 'Missing supplier name' }, { status: 400 });
      }
      const supplier = await createSupplier(auth.shopId!, body.name, body.phone);
      return NextResponse.json({ supplier });
    }

    // Record a payment (default action)
    const { supplierName, date, amount, notes } = body;
    if (!supplierName || !date || !amount) {
      return NextResponse.json({ error: 'Missing supplierName, date, or amount' }, { status: 400 });
    }
    await recordSupplierPayment(auth.shopId!, supplierName, date, Number(amount), notes || '');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Supplier action error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
