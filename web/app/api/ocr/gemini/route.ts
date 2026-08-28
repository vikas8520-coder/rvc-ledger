import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are an expert OCR assistant for a vegetable market shop in Telangana, India.
You read photographs of bills and ledger entries that may be:
- Handwritten in Telugu, Hindi, or English
- Printed in any of those languages
- Mixed language (e.g. Telugu names with English numbers)
- Transliterated (Telugu written in English script)

Extract ALL text visible in the image, preserving the original structure:
- Customer names (keep original script — Telugu, Hindi, or English)
- Item names (keep original script)
- Quantities and units (kg, g, pieces, dozen, etc.)
- Rates and amounts (numbers)
- Dates (any format)
- Bill numbers
- Any other text on the bill

Rules:
1. Output ONLY the raw text as it appears on the bill — do not translate, do not summarize
2. Preserve line breaks — each line on the bill should be a line in your output
3. If you can read Telugu script, output Telugu script (do not transliterate to English)
4. If the text is in English, output English
5. If you cannot read something clearly, output your best guess followed by [?]
6. Do not add commentary, explanations, or notes
7. If the image is not a bill or contains no readable text, output: [NO TEXT FOUND]`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireShopAuth();
    if (!auth.shopId) {
      return NextResponse.json({ error: 'No shop context' }, { status: 403 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 });
    }

    // Validate MIME type — only allow image formats Gemini supports
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: 'Unsupported image format' }, { status: 400 });
    }

    // Limit image size to 10MB decoded (base64 is ~33% larger than binary)
    const MAX_BASE64_LENGTH = 14 * 1024 * 1024; // ~10MB binary → ~14MB base64
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413 });
    }

    const payload = {
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    };

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('\n') ||
      '';

    if (!text || text.trim() === '') {
      return NextResponse.json({ text: '', error: 'No text extracted' }, { status: 200 });
    }

    return NextResponse.json({ text: text.trim() });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Gemini OCR error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
