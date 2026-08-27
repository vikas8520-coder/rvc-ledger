import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createShop, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }
    if (authResult.shopId) {
      return NextResponse.json({ error: 'You already have a shop', shopId: authResult.shopId }, { status: 400 });
    }
    const body = await request.json();
    if (!body.shopName?.trim()) {
      return NextResponse.json({ error: 'Shop name is required' }, { status: 400 });
    }
    const shopId = await createShop(
      authResult.userId,
      authResult.email,
      authResult.name,
      body.shopName.trim(),
      body.shopAddress?.trim() || '',
      body.shopPhone?.trim() || '',
    );
    return NextResponse.json({ ok: true, shopId });
  } catch (err: any) {
    console.error('Onboarding error:', err);
    return NextResponse.json({ error: err.message || 'Onboarding failed' }, { status: 500 });
  }
}
