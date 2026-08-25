import { NextRequest, NextResponse } from 'next/server';
import { deleteTransaction } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteTransaction(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Delete transaction error:', err);
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
  }
}
