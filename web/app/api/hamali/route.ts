import { NextResponse } from 'next/server';
import { getHamaliRates, calculateHamali } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireShopAuth();
    const { searchParams } = new URL(request.url);
    const commodity = searchParams.get('commodity');
    const weightKg = searchParams.get('weight');
    const bags = searchParams.get('bags');

    const rates = await getHamaliRates(auth.shopId!);

    // If commodity is provided, return calculated hamali
    if (commodity) {
      const w = weightKg ? parseFloat(weightKg) : null;
      const b = bags ? parseInt(bags, 10) : 1;
      const calc = calculateHamali(commodity, w, rates, b);
      return NextResponse.json({ rates, calculation: calc });
    }

    // Otherwise return all rates
    return NextResponse.json({ rates });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get hamali rates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
