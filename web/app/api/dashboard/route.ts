import { NextRequest, NextResponse } from 'next/server';
import { getCustomers, getFYSummary, autoCloseFY, currentFYStartYear, isDbConfigured } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const fyParam = searchParams.get('fy');
    // Default to current FY if not specified; use 'all' for all-time
    const fyStartYear = fyParam === 'all' ? undefined : fyParam ? Number(fyParam) : currentFYStartYear();

    // Auto-close previous FY if needed
    const autoCloseResult = await autoCloseFY(auth.shopId!);

    const customers = await getCustomers(auth.shopId!, fyStartYear);
    const fySummary = fyStartYear !== undefined ? await getFYSummary(auth.shopId!, fyStartYear) : null;

    return NextResponse.json({
      customers,
      configured: isDbConfigured(),
      fy: fyStartYear ?? null,
      fySummary,
      autoClosed: autoCloseResult.closed ? autoCloseResult.fyStartYear : null,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Dashboard error:', err.message, err.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
