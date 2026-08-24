import { NextResponse } from 'next/server';
import { getCustomerNames } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const names = await getCustomerNames();
    return NextResponse.json({ names });
  } catch (err: any) {
    console.error('Get customers error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
