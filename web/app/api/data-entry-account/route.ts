import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireShopAuth, AuthError } from '@/lib/auth';
import { getDataEntryUser, linkDataEntryUser, removeDataEntryUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — check if data-entry account exists for this shop
export async function GET() {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }
    const user = await getDataEntryUser(auth.shopId!);
    return NextResponse.json({ exists: !!user, email: user?.email || null, name: user?.name || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof AuthError ? e.status : 500 });
  }
}

// POST — create data-entry account (auto-generate email + password)
export async function POST(req: Request) {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const customPassword = body.password as string | undefined;

    // Check if one already exists
    const existing = await getDataEntryUser(auth.shopId!);
    if (existing) {
      return NextResponse.json({ error: 'Data entry account already exists. Use PATCH to change password.' }, { status: 409 });
    }

    // Auto-generate email using the owner's email domain
    // Clerk requires a valid-looking email; use gmail.com as fallback
    const shopPrefix = auth.shopId!.slice(0, 8).toLowerCase();
    const ownerDomain = auth.email.split('@')[1] || 'gmail.com';
    const email = `rvc.dataentry.${shopPrefix}@${ownerDomain}`;

    // Auto-generate password if not provided: 12 chars, mixed case + digits
    // Clerk requires min 8 chars, not in hacked passwords list
    const password = customPassword || generatePassword(12);

    // Create Clerk user via Backend API
    const client = await clerkClient();
    const clerkUser = await client.users.createUser({
      emailAddress: [email],
      password,
      firstName: 'Data',
      lastName: 'Entry',
      publicMetadata: { profile: 'data_entry', shopId: auth.shopId },
    });

    // Link to shop in our DB
    await linkDataEntryUser(auth.shopId!, clerkUser.id, email, 'Data Entry');

    return NextResponse.json({
      success: true,
      email,
      password,
      clerkUserId: clerkUser.id,
    });
  } catch (e: any) {
    console.error('Create data-entry account error:', e);
    // Extract the most useful error message from Clerk's error structure
    const errMsg = e?.errors?.[0]?.message || e?.message || 'Failed to create data entry account';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// PATCH — change password for data-entry account
export async function PATCH(req: Request) {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const customPassword = body.password as string | undefined;

    const existing = await getDataEntryUser(auth.shopId!);
    if (!existing) {
      return NextResponse.json({ error: 'No data entry account found. Create one first.' }, { status: 404 });
    }

    const password = customPassword || generatePassword(10);

    // Update Clerk user password
    const client = await clerkClient();
    await client.users.updateUser(existing.clerkUserId, { password });

    return NextResponse.json({ success: true, password });
  } catch (e: any) {
    console.error('Change data-entry password error:', e);
    const errMsg = e?.errors?.[0]?.message || e?.message || 'Failed to change password';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// DELETE — remove data-entry account
export async function DELETE() {
  try {
    const auth = await requireShopAuth();
    if (auth.profile !== 'owner' && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const existing = await getDataEntryUser(auth.shopId!);
    if (!existing) {
      return NextResponse.json({ error: 'No data entry account found.' }, { status: 404 });
    }

    // Delete Clerk user
    const client = await clerkClient();
    await client.users.deleteUser(existing.clerkUserId);

    // Remove from our DB
    await removeDataEntryUser(auth.shopId!);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Delete data-entry account error:', e);
    return NextResponse.json({ error: e.message || 'Failed to delete account' }, { status: 500 });
  }
}

// Generate a random password: mixed case + digits, easy to share verbally
function generatePassword(length: number): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  let result = '';
  // Ensure at least one of each type for password requirements
  result += lower[Math.floor(Math.random() * lower.length)];
  result += upper[Math.floor(Math.random() * upper.length)];
  result += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 3; i < length; i++) {
    result += all[Math.floor(Math.random() * all.length)];
  }
  // Shuffle
  return result.split('').sort(() => Math.random() - 0.5).join('');
}
