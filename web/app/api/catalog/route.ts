import { NextRequest, NextResponse } from 'next/server';
import { getCatalog, saveCatalogItem } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const items = await getCatalog(auth.shopId!);
    return NextResponse.json({ items });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get catalog error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }
    await saveCatalogItem(auth.shopId!, {
      id: body.id,
      name: body.name.trim(),
      defaultUnit: body.defaultUnit || null,
      defaultSellPrice: body.defaultSellPrice ? Number(body.defaultSellPrice) : null,
      teluguName: body.teluguName || null,
      hindiName: body.hindiName || null,
      active: body.active !== false,
      aliases: Array.isArray(body.aliases) ? body.aliases.map((a: string) => a.trim()).filter(Boolean) : [],
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Save catalog error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
