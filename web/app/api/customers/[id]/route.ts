import { NextRequest, NextResponse } from 'next/server';
import { setCustomerPhone } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const phone = String(body.phone ?? '').trim();
    if (phone && !/^[\d+\-\s()]{6,20}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }
    await setCustomerPhone(id, phone);
    return NextResponse.json({ ok: true, phone });
  } catch (err: any) {
    console.error('Update customer error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
