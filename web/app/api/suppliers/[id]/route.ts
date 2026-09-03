import { NextRequest, NextResponse } from 'next/server';
import { setSupplierPhone, setSupplierCommission } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireShopAuth();
    const { id } = await params;
    const body = await request.json();

    // Update commission percentage (hidden, per-farmer)
    if (body.commissionPct !== undefined) {
      await setSupplierCommission(auth.shopId!, id, String(body.commissionPct));
      return NextResponse.json({ ok: true });
    }

    // Update phone (default)
    const { phone } = body;
    await setSupplierPhone(auth.shopId!, id, phone || '');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Update supplier error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
