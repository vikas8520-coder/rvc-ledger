import { NextRequest, NextResponse } from 'next/server';
import { getExpenses, saveExpense } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const entries = await getExpenses(auth.shopId!);
    return NextResponse.json({ entries });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get expenses error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    if (!body.date || !body.category || !body.amount) {
      return NextResponse.json({ error: 'Missing date, category, or amount' }, { status: 400 });
    }
    await saveExpense(auth.shopId!, {
      date: body.date,
      category: body.category,
      description: body.description || '',
      amount: Number(body.amount),
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save expense error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
