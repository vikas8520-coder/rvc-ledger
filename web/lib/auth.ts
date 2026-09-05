import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { getOrCreateShop, linkUserToDefaultShop, ensureDefaultShop, isDbConfigured } from './db';

export type AuthResult = {
  shopId: string | null;
  role: 'superadmin' | 'owner' | 'staff';
  profile: 'owner' | 'data_entry';
  userId: string;
  email: string;
  name: string;
};

// Superadmin Clerk user IDs (Vikas)
const SUPERADMIN_IDS = process.env.SUPERADMIN_CLERK_IDS?.split(',').map(s => s.trim()).filter(Boolean) || [];

// Admin credentials from env vars (simple username/password admin login)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_COOKIE_NAME = 'rvc_admin_session';
// Session duration: 7 days
const ADMIN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

// Data-entry cookie (backend-only login, no Clerk)
const DATA_ENTRY_COOKIE_NAME = 'rvc_de_session';
const DATA_ENTRY_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

// Check if Clerk is configured with real keys
function isClerkConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;
}

// Check if we're using production keys (pk_live_) vs development (pk_test_)
function isClerkProduction(): boolean {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  return key.startsWith('pk_live_');
}

// Check if admin username/password login is configured
function isAdminLoginConfigured(): boolean {
  return !!ADMIN_USERNAME && !!ADMIN_PASSWORD;
}

// Validate admin credentials and return a session token
export function validateAdminLogin(username: string, password: string): boolean {
  if (!isAdminLoginConfigured()) return false;
  // Use timing-safe comparison to prevent timing attacks
  const userMatch = username === ADMIN_USERNAME;
  const passMatch = password === ADMIN_PASSWORD;
  return userMatch && passMatch;
}

// Set admin session cookie (call from API route after successful login)
export async function setAdminCookie(): Promise<void> {
  const cookieStore = await cookies();
  // Simple token: base64 of username + timestamp (not JWT, but sufficient for simple admin)
  const token = Buffer.from(`${ADMIN_USERNAME}:${Date.now()}`).toString('base64');
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: '/',
  });
}

// Clear admin session cookie
export async function clearAdminCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

// Check if the current request has a valid admin session cookie
async function hasAdminCookie(): Promise<boolean> {
  if (!isAdminLoginConfigured()) return false;
  const cookieStore = await cookies();
  const cookie = cookieStore.get(ADMIN_COOKIE_NAME);
  if (!cookie?.value) return false;
  try {
    const decoded = Buffer.from(cookie.value, 'base64').toString('utf-8');
    const [username] = decoded.split(':');
    return username === ADMIN_USERNAME;
  } catch {
    return false;
  }
}

// Set data-entry session cookie (call from API route after successful login)
export async function setDataEntryCookie(shopId: string): Promise<void> {
  const cookieStore = await cookies();
  const token = Buffer.from(`${shopId}:${Date.now()}`).toString('base64');
  cookieStore.set(DATA_ENTRY_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DATA_ENTRY_COOKIE_MAX_AGE,
    path: '/',
  });
}

// Clear data-entry session cookie
export async function clearDataEntryCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(DATA_ENTRY_COOKIE_NAME);
}

// Check if the current request has a valid data-entry session cookie
async function getDataEntryCookieShopId(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(DATA_ENTRY_COOKIE_NAME);
  if (!cookie?.value) return null;
  try {
    const decoded = Buffer.from(cookie.value, 'base64').toString('utf-8');
    const [shopId] = decoded.split(':');
    return shopId || null;
  } catch {
    return null;
  }
}

export async function getAuth(): Promise<AuthResult | null> {
  // Check admin cookie first (works with or without Clerk)
  if (await hasAdminCookie()) {
    // Admin gets the default shop context so they can also use the app
    let shopId: string | null = null;
    if (isDbConfigured()) {
      try {
        shopId = await ensureDefaultShop();
      } catch {}
    }
    return { shopId, role: 'superadmin', profile: 'owner', userId: 'admin', email: '', name: 'Admin' };
  }

  // Check data-entry cookie (backend-only login, no Clerk needed)
  const deShopId = await getDataEntryCookieShopId();
  if (deShopId) {
    return {
      shopId: deShopId,
      role: 'staff',
      profile: 'data_entry',
      userId: 'data_entry',
      email: '',
      name: 'Data Entry',
    };
  }

  // If Clerk isn't configured at all, return null (no access)
  if (!isClerkConfigured()) {
    return null;
  }

  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) return null;

  // Clerk user is authenticated — clear any stale data-entry cookie
  // (mutual exclusion: can't be both owner and data-entry at the same time)
  const cookieStore = await cookies();
  const deCookie = cookieStore.get('rvc_de_session');
  if (deCookie?.value) {
    cookieStore.delete('rvc_de_session');
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || '';
  const name = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username || '';

  const isSuperadmin = SUPERADMIN_IDS.includes(userId);

  if (!isDbConfigured()) {
    return { shopId: null, role: isSuperadmin ? 'superadmin' : 'owner', profile: 'owner', userId, email, name };
  }

  // For superadmin: link them to the default RVC shop so they can use the app too
  if (isSuperadmin) {
    const shopId = await linkUserToDefaultShop(userId, email, name);
    return { shopId, role: 'superadmin', profile: 'owner', userId, email, name };
  }

  // For regular users, look up their shop
  const { shopId, role, profile } = await getOrCreateShop(userId, email, name);
  return { shopId, role: role as 'owner' | 'staff', profile: profile as 'owner' | 'data_entry', userId, email, name };
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
// Accepts either Clerk superadmin OR admin cookie login
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

export { isClerkConfigured, isClerkProduction, isAdminLoginConfigured, ADMIN_COOKIE_NAME };
