import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File;
    const title = (formData.get('title') as string) || 'Document';

    if (!file) {
      return NextResponse.json({ error: 'No PDF provided' }, { status: 400 });
    }

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS shared_pdfs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        data BYTEA NOT NULL,
        mime_type TEXT DEFAULT 'application/pdf',
        created_at TIMESTAMPTZ DEFAULT now(),
        expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days'
      )
    `;

    // Insert the PDF
    const [row] = await sql`
      INSERT INTO shared_pdfs (title, filename, data, mime_type)
      VALUES (${title}, ${file.name}, ${buffer}, 'application/pdf')
      RETURNING id
    `;

    return NextResponse.json({ id: row.id, url: `/pdf/${row.id}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST to upload' }, { status: 405 });
}
