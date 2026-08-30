import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Check if Clerk is configured at all
const isClerkConfigured = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
// Check if we're using production keys (pk_live_) vs development (pk_test_)
const isClerkProduction = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').startsWith('pk_live_');

// If Clerk is configured, use clerkMiddleware; otherwise use noop
// For API routes, we always need auth to work if Clerk is configured
export default isClerkConfigured
  ? clerkMiddleware()
  : function noopMiddleware() {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes
    '/__clerk/(.*)',
  ],
};
