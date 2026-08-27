import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateShop, isDbConfigured } from './db';

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

  // Check if this is a superadmin
  if (SUPERADMIN_IDS.includes(userId)) {
    const user = await currentUser();
    return {
      shopId: null, // superadmin has no single shop
      role: 'superadmin',
      userId,
      email: user?.emailAddresses?.[0]?.emailAddress || '',
      name: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username || '',
    };
  }

  // For regular users, look up their shop
  if (!isDbConfigured()) {
    return { shopId: null, role: 'owner', userId, email: '', name: '' };
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || '';
  const name = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username || '';

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
  if (authResult.role === 'superadmin') {
    throw new AuthError(403, 'Superadmin cannot access shop routes directly');
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
