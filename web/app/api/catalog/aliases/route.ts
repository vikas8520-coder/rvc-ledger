import { NextRequest, NextResponse } from 'next/server';
import { getAliasMap, saveAlias } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const aliases = await getAliasMap(auth.shopId!);
    return NextResponse.json({ aliases });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get aliases error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    const { alias, itemName } = body;
    if (!alias?.trim() || !itemName?.trim()) {
      return NextResponse.json({ error: 'Missing alias or itemName' }, { status: 400 });
    }
    await saveAlias(auth.shopId!, alias.trim(), itemName.trim());
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save alias error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
