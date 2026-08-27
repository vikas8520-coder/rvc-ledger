import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authResult = await getAuth();
    if (!authResult) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    return NextResponse.json({
      authenticated: true,
      userId: authResult.userId,
      role: authResult.role,
      shopId: authResult.shopId,
      name: authResult.name,
      email: authResult.email,
    });
  } catch (err: any) {
    console.error('Get me error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
