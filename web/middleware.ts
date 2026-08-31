import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_COOKIE_NAME = 'rvc_admin_session';

const publicPaths = [
  '/admin/login',
  '/api/admin/login',
  '/api/admin/logout',
  '/api/subscription',
  '/pdf/', // shared PDF viewer — public by design
  '/sign-in',
  '/sign-up',
];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
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
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|json|webmanifest|txt|xml|map|sw)).*)',
  ],
};
