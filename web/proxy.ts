import { NextResponse, type NextRequest } from 'next/server';

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

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /admin/* and /api/admin/* routes.
  // Shop pages (/, /sell, /customers, etc.) are public —
  // authentication is handled client-side by Clerk via AppShell.
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/') ||
                       pathname.startsWith('/api/admin/');

  if (!isAdminRoute) {
    return NextResponse.next();
  }

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

export const config = {
  // Run proxy on all routes except static files
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
