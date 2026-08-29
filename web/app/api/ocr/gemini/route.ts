import { NextRequest, NextResponse } from 'next/server';
import { requireShopAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Models to try — gemini-3.6-flash is most reliable for vision OCR right now
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
];

const SYSTEM_PROMPT = `You are an expert OCR assistant for a vegetable market shop in Bowenpally, Telangana, India.
You read photographs of bills and daily ledger pages that may be:
- Handwritten in Telugu, Hindi, or English
- Printed in any of those languages
- Mixed language (e.g. Telugu names with English numbers)
- A single bill for one customer, OR a daily ledger page with multiple customers

Your job: extract structured data from the image.

For each customer bill visible in the image, extract:
- customer_name: the customer name (keep original script — Telugu, Hindi, or English)
- date: date if visible (format: YYYY-MM-DD, or null)
- bill_no: bill number if visible (or null)
- items: array of line items, each with:
  - name: item/vegetable name (keep original script)
  - qty: quantity as string (e.g. "10", "5 kg", "3")
  - rate: rate per unit as string (e.g. "40", "25/kg") or null if not visible
  - amount: total amount for this item as number (or null if not visible)
- total: total bill amount as number (or null if not visible)

Rules:
1. Keep names in their original script — do NOT transliterate Telugu to English
2. If you cannot read a value, use null — do NOT guess numbers
3. If the image is a single bill, return an array with one entry
4. If the image is a daily ledger with multiple customers, return multiple entries
5. Output ONLY a JSON array, no other text, no markdown, no explanation
6. If the image has no readable text, return: []

Example output:
[
  {
    "customer_name": "రవి",
    "date": "2026-08-29",
    "bill_no": null,
    "items": [
      {"name": "టమాట", "qty": "10", "rate": "40", "amount": 400},
      {"name": "Bendi", "qty": "5 kg", "rate": "30", "amount": 150}
    ],
    "total": 550
  }
]`;

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

    // Validate MIME type
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: 'Unsupported image format' }, { status: 400 });
    }

    // Limit image size
    const MAX_BASE64_LENGTH = 14 * 1024 * 1024;
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
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    };

    // Try each model in order — with a 25s timeout per model so we
    // don't burn the entire 120s Vercel limit on one overloaded model
    let lastError = '';
    for (const model of GEMINI_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const rawText =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            data?.candidates?.[0]?.content?.parts
              ?.filter((p: any) => p.text)
              .map((p: any) => p.text)
              .join('\n') ||
            '';

          if (rawText && rawText.trim() !== '') {
            // Parse the JSON response
            try {
              const bills = JSON.parse(rawText);
              if (Array.isArray(bills)) {
                return NextResponse.json({ bills, rawText });
              }
              // If it's not an array, wrap it
              if (bills && typeof bills === 'object') {
                return NextResponse.json({ bills: [bills], rawText });
              }
            } catch (parseErr) {
              console.error('JSON parse failed, returning raw text:', parseErr);
              // If JSON parsing fails, return raw text for fallback parsing
              return NextResponse.json({ bills: [], rawText });
            }
          }
          lastError = 'No text extracted';
          continue;
        }

        const errText = await response.text();
        console.error(`Gemini ${model} error:`, response.status, errText);

        if (response.status === 503 || response.status === 429) {
          lastError = `Model ${model} overloaded (${response.status})`;
          continue;
        }

        lastError = `Model ${model} error: ${response.status}`;
        continue;
      } catch (fetchErr: any) {
        console.error(`Gemini ${model} fetch error:`, fetchErr);
        lastError = fetchErr.message;
        continue;
      }
    }

    console.error('All Gemini models failed:', lastError);
    return NextResponse.json(
      { error: lastError || 'All Gemini models unavailable' },
      { status: 502 }
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Gemini OCR error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
