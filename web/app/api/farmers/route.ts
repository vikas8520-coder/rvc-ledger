import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { getFarmerSummary, getFarmerPatti, getFarmerPattiHistory, listFarmersOnDate, currentFYStartYear } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const from = searchParams.get('from') || date;
    const to = searchParams.get('to') || date;
    const farmer = searchParams.get('farmer');
    const history = searchParams.get('history');

    // Farmer patti history (list of dates with summary)
    if (history === '1' && farmer) {
      const hist = await getFarmerPattiHistory(auth.shopId!, farmer, from || undefined, to || undefined);
      return NextResponse.json({ history: hist, farmer });
    }

    if (from && to && farmer) {
      const patti = await getFarmerPatti(auth.shopId!, farmer, from, to);
      if (!patti) return NextResponse.json({ error: 'No sales for that farmer in that date range' }, { status: 404 });
      return NextResponse.json({ patti });
    }

    if (from && to) {
      const names = await listFarmersOnDate(auth.shopId!, from, to);
      return NextResponse.json({ farmers: names, from, to });
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
