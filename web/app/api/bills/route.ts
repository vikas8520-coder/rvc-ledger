import { NextRequest, NextResponse } from 'next/server';
import { saveBill } from '@/lib/db';
import { BillData } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body: BillData = await request.json();
    if (!body.customerName || !body.date || !body.items?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    await saveBill(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Save bill error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
