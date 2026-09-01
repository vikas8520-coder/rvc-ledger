import { NextRequest, NextResponse } from 'next/server';
import { saveEntryBatch } from '@/lib/db';
import { BillData, PurchaseData } from '@/lib/types';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = (await request.json()) as { bills?: BillData[]; purchase?: PurchaseData | null };
    const bills = body.bills || [];
    if (!bills.length) {
      return NextResponse.json({ error: 'No sales to save' }, { status: 400 });
    }
    for (const bill of bills) {
      if ((!bill.customerName && !bill.customerId) || !bill.date || !bill.items?.length) {
        return NextResponse.json({ error: 'Each sale needs customer, date, and items' }, { status: 400 });
      }
    }
    await saveEntryBatch(auth.shopId!, bills, body.purchase || null);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save entry batch error:', err);
    const message = err instanceof Error ? err.message : 'Save failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
