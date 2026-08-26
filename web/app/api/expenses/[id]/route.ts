import { NextResponse } from 'next/server';
import { deleteExpense } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Delete expense error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
