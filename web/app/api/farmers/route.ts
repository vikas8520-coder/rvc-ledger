import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { getFarmerSummary, getFarmerPatti, listFarmersOnDate, currentFYStartYear } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const farmer = searchParams.get('farmer');

    if (date && farmer) {
      const patti = await getFarmerPatti(auth.shopId!, farmer, date);
      if (!patti) return NextResponse.json({ error: 'No sales for that farmer on that date' }, { status: 404 });
      return NextResponse.json({ patti });
    }

    if (date) {
      const names = await listFarmersOnDate(auth.shopId!, date);
      return NextResponse.json({ farmers: names, date });
    }

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
