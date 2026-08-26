import { NextRequest, NextResponse } from 'next/server';
import { setSupplierPhone } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { phone } = await request.json();
    await setSupplierPhone(id, phone || '');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Update supplier error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
