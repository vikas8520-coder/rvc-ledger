import { NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { setDataEntryPassword, verifyDataEntryPassword } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST — data-entry user changes their own password
// Requires currentPassword + newPassword
export async function POST(req: Request) {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'data_entry') {
      return NextResponse.json({ error: 'Only data entry users can use this endpoint' }, { status: 403 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password required' }, { status: 400 });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 4) {
      return NextResponse.json({ error: 'New password must be at least 4 characters' }, { status: 400 });
    }

    // Verify current password
    const shopId = await verifyDataEntryPassword(currentPassword);
    if (!shopId || shopId !== auth.shopId) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Set new password
    await setDataEntryPassword(auth.shopId!, newPassword);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Data-entry change password error:', e);
    return NextResponse.json({ error: e?.message || 'Failed to change password' }, { status: e instanceof AuthError ? e.status : 500 });
  }
}
