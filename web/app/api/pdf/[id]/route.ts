import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [row] = await sql`
      SELECT data, mime_type, title, filename
      FROM shared_pdfs
      WHERE id = ${id}::uuid
        AND (expires_at IS NULL OR expires_at > now())
    `;

    if (!row) {
      return NextResponse.json({ error: 'PDF not found or expired' }, { status: 404 });
    }

    // Convert the bytea data to a proper response
    const buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data as any);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'application/pdf',
        'Content-Disposition': `inline; filename="${row.filename || 'document.pdf'}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
