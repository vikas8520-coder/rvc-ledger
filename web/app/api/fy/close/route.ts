import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { closeFY, currentFYStartYear, getFYSummary } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/fy/close — manually close a financial year
// Body: { fyStartYear?: number } — defaults to previous FY
export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json().catch(() => ({}));
    // Default: close the previous FY (so current FY has opening balances)
    const currentFY = currentFYStartYear();
    const fyToClose = body.fyStartYear !== undefined ? Number(body.fyStartYear) : currentFY - 1;

    if (fyToClose >= currentFY) {
      return NextResponse.json({ error: 'Cannot close current or future financial year' }, { status: 400 });
    }

    const result = await closeFY(auth.shopId!, fyToClose);
    const summary = await getFYSummary(auth.shopId!, fyToClose);

    return NextResponse.json({
      closed: true,
      fyStartYear: fyToClose,
      customersClosed: result.customersClosed,
      summary,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('FY close error:', err.message, err.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/fy/close — check FY close status
export async function GET() {
  try {
    const auth = await requireShopAuth();
    const currentFY = currentFYStartYear();
    const summary = await getFYSummary(auth.shopId!, currentFY);
    return NextResponse.json({
      currentFY,
      summary,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
