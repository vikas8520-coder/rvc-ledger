import { NextRequest, NextResponse } from 'next/server';
import { getExpenses, saveExpense } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const entries = await getExpenses();
    return NextResponse.json({ entries });
  } catch (err: any) {
    console.error('Get expenses error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.date || !body.category || !body.amount) {
      return NextResponse.json({ error: 'Missing date, category, or amount' }, { status: 400 });
    }
    await saveExpense({
      date: body.date,
      category: body.category,
      description: body.description || '',
      amount: Number(body.amount),
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Save expense error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
