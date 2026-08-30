import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { getFarmerSummary, currentFYStartYear } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const fyParam = searchParams.get('fy');
    const fyStartYear = fyParam ? Number(fyParam) : currentFYStartYear();
    const farmers = await getFarmerSummary(auth.shopId!, fyStartYear);
    return NextResponse.json({ farmers, fy: fyStartYear });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Farmer summary error:', err.message, err.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
