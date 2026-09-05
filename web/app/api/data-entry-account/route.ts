import { NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { setDataEntryPassword, hasDataEntryPassword, clearDataEntryPassword, getShopNumber } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — check if data-entry password is set, and return shop number
export async function GET() {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }
    const exists = await hasDataEntryPassword(auth.shopId!);
    const shopNumber = await getShopNumber(auth.shopId!);
    return NextResponse.json({ exists, shopNumber });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof AuthError ? e.status : 500 });
  }
}

// POST — set data-entry password (admin must provide shop number + password manually)
export async function POST(req: Request) {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const shopNumber = (body.shopNumber as string || '').trim();
    const password = (body.password as string || '').trim();

    if (!shopNumber) {
      return NextResponse.json({ error: 'Shop number is required (e.g. B-11)' }, { status: 400 });
    }
    if (!password || password.length < 4) {
      return NextResponse.json({ error: 'Password is required (min 4 characters)' }, { status: 400 });
    }

    await setDataEntryPassword(auth.shopId!, password, shopNumber);

    return NextResponse.json({ success: true, shopNumber, password });
  } catch (e: any) {
    console.error('Set data-entry password error:', e);
    const errMsg = e?.message || String(e) || 'Failed to set password';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// PATCH — change data-entry password (admin must provide shop number + new password)
export async function PATCH(req: Request) {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const shopNumber = (body.shopNumber as string || '').trim();
    const password = (body.password as string || '').trim();

    if (!shopNumber) {
      return NextResponse.json({ error: 'Shop number is required' }, { status: 400 });
    }
    if (!password || password.length < 4) {
      return NextResponse.json({ error: 'Password is required (min 4 characters)' }, { status: 400 });
    }

    await setDataEntryPassword(auth.shopId!, password, shopNumber);

    return NextResponse.json({ success: true, shopNumber, password });
  } catch (e: any) {
    console.error('Change data-entry password error:', e);
    return NextResponse.json({ error: e.message || 'Failed to change password' }, { status: 500 });
  }
}

// DELETE — remove data-entry password
export async function DELETE() {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    await clearDataEntryPassword(auth.shopId!);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Delete data-entry password error:', e);
    return NextResponse.json({ error: e.message || 'Failed to delete' }, { status: 500 });
  }
}
