import { NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { setDataEntryPassword, hasDataEntryPassword, clearDataEntryPassword } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — check if data-entry password is set for this shop
export async function GET() {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }
    const exists = await hasDataEntryPassword(auth.shopId!);
    return NextResponse.json({ exists });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof AuthError ? e.status : 500 });
  }
}

// POST — set data-entry password (auto-generate if not provided)
export async function POST(req: Request) {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const customPassword = body.password as string | undefined;

    const password = customPassword || generatePassword(8);
    await setDataEntryPassword(auth.shopId!, password);

    return NextResponse.json({ success: true, password });
  } catch (e: any) {
    console.error('Set data-entry password error:', e);
    return NextResponse.json({ error: e.message || 'Failed to set password' }, { status: 500 });
  }
}

// PATCH — change data-entry password (auto-generate if not provided)
export async function PATCH(req: Request) {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const customPassword = body.password as string | undefined;

    const password = customPassword || generatePassword(8);
    await setDataEntryPassword(auth.shopId!, password);

    return NextResponse.json({ success: true, password });
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

// Generate a random password: lowercase + digits, easy to share verbally
function generatePassword(length: number): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
