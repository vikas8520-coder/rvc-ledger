import { NextResponse } from 'next/server';
import { exportAllData, istToday } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const data = await exportAllData(auth.shopId!);
    return NextResponse.json(data, {
      headers: {
        'Content-Disposition': `attachment; filename="rvc-backup-${istToday()}.json"`,
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Backup error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
