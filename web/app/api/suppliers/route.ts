import { NextRequest, NextResponse } from 'next/server';
import { getSuppliers, recordSupplierPayment } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const suppliers = await getSuppliers();
    return NextResponse.json({ suppliers });
  } catch (err: any) {
    console.error('Get suppliers error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supplierName, date, amount, notes } = await request.json();
    if (!supplierName || !date || !amount) {
      return NextResponse.json({ error: 'Missing supplierName, date, or amount' }, { status: 400 });
    }
    await recordSupplierPayment(supplierName, date, Number(amount), notes || '');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Supplier payment error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
