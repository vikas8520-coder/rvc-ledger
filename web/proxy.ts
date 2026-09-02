import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

const ADMIN_COOKIE_NAME = 'rvc_admin_session';

// Check if Clerk is configured with real keys
const CLERK_CONFIGURED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Public admin routes that don't require the admin cookie
const publicAdminPaths = [
  '/admin/login',
  '/api/admin/login',
  '/api/admin/logout',
];

function isPublicAdminPath(pathname: string): boolean {
  return publicAdminPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Admin auth logic — works with or without Clerk
function adminHandler(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/') ||
                       pathname.startsWith('/api/admin/');

  if (isAdminRoute) {
    if (isPublicAdminPath(pathname)) {
      return NextResponse.next();
    }
    const adminCookie = req.cookies.get(ADMIN_COOKIE_NAME);
    if (adminCookie?.value) {
      return NextResponse.next();
    }
    const loginUrl = new URL('/admin/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// When Clerk is configured, use clerkMiddleware (which handles shop auth).
// When Clerk is NOT configured (local dev/testing without Clerk keys),
// use a plain middleware that only handles admin routes.
export default CLERK_CONFIGURED
  ? clerkMiddleware((_auth, req) => adminHandler(req))
  : adminHandler;

export const config = {
  // Run proxy on all routes except static files
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
