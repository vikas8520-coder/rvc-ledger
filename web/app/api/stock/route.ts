import { NextResponse } from 'next/server';
import { getStock } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stock = await getStock();
    return NextResponse.json({ stock });
  } catch (err: any) {
    console.error('Get stock error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
