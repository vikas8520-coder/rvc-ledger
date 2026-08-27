import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateShop, linkUserToDefaultShop, isDbConfigured } from './db';

export type AuthResult = {
  shopId: string | null;
  role: 'superadmin' | 'owner' | 'staff';
  userId: string;
  email: string;
  name: string;
};

// Superadmin Clerk user IDs (Vikas)
const SUPERADMIN_IDS = process.env.SUPERADMIN_CLERK_IDS?.split(',').map(s => s.trim()).filter(Boolean) || [];

export async function getAuth(): Promise<AuthResult | null> {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) return null;

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || '';
  const name = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username || '';

  const isSuperadmin = SUPERADMIN_IDS.includes(userId);

  if (!isDbConfigured()) {
    return { shopId: null, role: isSuperadmin ? 'superadmin' : 'owner', userId, email, name };
  }

  // For superadmin: link them to the default RVC shop so they can use the app too
  if (isSuperadmin) {
    const shopId = await linkUserToDefaultShop(userId, email, name);
    return { shopId, role: 'superadmin', userId, email, name };
  }

  // For regular users, look up their shop
  const { shopId, role } = await getOrCreateShop(userId, email, name);
  return { shopId, role: role as 'owner' | 'staff', userId, email, name };
}

// Require auth + shop — returns AuthResult or throws
// Use in API routes that need a shop context
export async function requireShopAuth(): Promise<AuthResult> {
  const authResult = await getAuth();
  if (!authResult) {
    throw new AuthError(401, 'Unauthorized');
  }
  if (!authResult.shopId) {
    throw new AuthError(403, 'No shop found — complete onboarding');
  }
  return authResult;
}

// Require auth + superadmin — for admin routes
export async function requireAdminAuth(): Promise<AuthResult> {
  const authResult = await getAuth();
  if (!authResult) {
    throw new AuthError(401, 'Unauthorized');
  }
  if (authResult.role !== 'superadmin') {
    throw new AuthError(403, 'Admin access required');
  }
  return authResult;
}

// Require auth only (any role) — for onboarding
export async function requireAuth(): Promise<AuthResult> {
  const authResult = await getAuth();
  if (!authResult) {
    throw new AuthError(401, 'Unauthorized');
  }
  return authResult;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
