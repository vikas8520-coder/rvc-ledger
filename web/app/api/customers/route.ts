import { NextRequest, NextResponse } from 'next/server';
import { getCustomerNames, addCustomer } from '@/lib/db';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireShopAuth();
    const names = await getCustomerNames(auth.shopId!);
    return NextResponse.json({ names });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Get customers error:', err);
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
    const customer = await addCustomer(auth.shopId!, {
      name: body.name.trim(),
      englishName: body.englishName?.trim() || null,
      teluguName: body.teluguName?.trim() || null,
      hindiName: body.hindiName?.trim() || null,
      phone: body.phone?.trim() || null,
      creditLimit: body.creditLimit ? parseFloat(body.creditLimit) : null,
    });
    return NextResponse.json({ id: customer.id, name: customer.name });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Add customer error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}