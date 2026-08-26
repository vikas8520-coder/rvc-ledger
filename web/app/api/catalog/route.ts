import { NextRequest, NextResponse } from 'next/server';
import { getCatalog, saveCatalogItem } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = await getCatalog();
    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('Get catalog error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }
    await saveCatalogItem({
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
    console.error('Save catalog error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
