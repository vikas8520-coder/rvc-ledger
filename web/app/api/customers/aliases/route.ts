import { NextRequest, NextResponse } from 'next/server';
import { getCustomerAliasMap, saveCustomerAlias } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const aliases = await getCustomerAliasMap(auth.shopId!);
    return NextResponse.json({ aliases });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get customer aliases error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    const { rawName, customerName, customerId } = body;
    if (!rawName?.trim() || !customerName?.trim()) {
      return NextResponse.json({ error: 'Missing rawName or customerName' }, { status: 400 });
    }
    await saveCustomerAlias(auth.shopId!, rawName.trim(), customerName.trim(), customerId || null);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save customer alias error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
