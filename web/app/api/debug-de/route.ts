import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const deCookie = cookieStore.get('rvc_de_session');
  const adminCookie = cookieStore.get('rvc_admin_session');

  let authResult: any = null;
  try {
    authResult = await getAuth();
  } catch (e: any) {
    authResult = { error: e.message };
  }

  return NextResponse.json({
    deCookie: deCookie ? { name: deCookie.name, valuePreview: deCookie.value.slice(0, 20) + '...' } : null,
    adminCookie: adminCookie ? 'present' : null,
    authResult,
  });
}
