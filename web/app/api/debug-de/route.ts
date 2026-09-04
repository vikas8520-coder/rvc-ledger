import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuth } from '@/lib/auth';
import { isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const deCookie = cookieStore.get('rvc_de_session');
  const adminCookie = cookieStore.get('rvc_admin_session');
  const clerkCookie = cookieStore.get('__clerk_db_jwt');

  let authResult: any = null;
  try {
    authResult = await getAuth();
  } catch (e: any) {
    authResult = { error: e.message };
  }

  return NextResponse.json({
    cookies: {
      deSession: deCookie ? 'present' : 'absent',
      adminSession: adminCookie ? 'present' : 'absent',
      clerkDbJwt: clerkCookie ? 'present' : 'absent',
    },
    dbConfigured: isDbConfigured(),
    authResult,
  });
}
