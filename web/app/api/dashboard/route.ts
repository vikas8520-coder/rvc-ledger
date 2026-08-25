import { NextResponse } from 'next/server';
import { getCustomers, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const customers = await getCustomers();
    return NextResponse.json({ customers, configured: isDbConfigured() });
  } catch (err: any) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
