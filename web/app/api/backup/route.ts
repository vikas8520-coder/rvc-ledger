import { NextResponse } from 'next/server';
import { exportAllData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await exportAllData();
    return NextResponse.json(data, {
      headers: {
        'Content-Disposition': `attachment; filename="rvc-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err: any) {
    console.error('Backup error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
