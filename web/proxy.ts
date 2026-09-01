import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

const ADMIN_COOKIE_NAME = 'rvc_admin_session';

// Public admin routes that don't require the admin cookie
const publicAdminPaths = [
  '/admin/login',
  '/api/admin/login',
  '/api/admin/logout',
];

function isPublicAdminPath(pathname: string): boolean {
  return publicAdminPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Combine Clerk middleware with admin cookie auth
export default clerkMiddleware((auth, req) => {
  const { pathname } = req.nextUrl;

  // Admin routes: check admin cookie (separate from Clerk)
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/') ||
                       pathname.startsWith('/api/admin/');

  if (isAdminRoute) {
    // Allow public admin routes (login, logout endpoints)
    if (isPublicAdminPath(pathname)) {
      return NextResponse.next();
    }
    // Check for admin session cookie
    const adminCookie = req.cookies.get(ADMIN_COOKIE_NAME);
    if (adminCookie?.value) {
      return NextResponse.next();
    }
    // Not authenticated — redirect to admin login
    const loginUrl = new URL('/admin/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Shop routes: Clerk handles auth automatically
  // Clerk will redirect unauthenticated users to /sign-in
  return NextResponse.next();
});

export const config = {
  // Run proxy on all routes except static files
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
