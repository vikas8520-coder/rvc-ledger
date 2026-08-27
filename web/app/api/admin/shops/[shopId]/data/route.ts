import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import { exportAllData, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    await requireAdminAuth();
    const { shopId } = await params;
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }
    const data = await exportAllData(shopId);
    return NextResponse.json(data);
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json({ error: err.message || 'Failed' }, { status });
  }
}
