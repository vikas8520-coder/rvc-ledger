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
You read photographs of daily sales ledger pages that may be handwritten in Telugu, Hindi, or English.

The page has TWO sections:

1. TOP SUMMARY (stock received that day):
   - bags_covers: number of small bags/covers
   - bigbags: number of big bags/bastas
   - total_bags: total (bags_covers + bigbags)
   - notes: any date or other text at the very top

2. CUSTOMER BILLS (below the summary):
   Each customer section has:
   - customer_name: the customer name (keep original script)
   - entries: each line has bags (number of bags), weight_kg (weight in kg), and name (supplier/location name)
   - total_bags: total bags for this customer
   - total_weight: total weight for this customer
   - total_amount: total amount for this customer

Output as JSON:
{
  "daily_summary": {
    "bags_covers": 204,
    "bigbags": 90,
    "total_bags": 294,
    "notes": "any text at top"
  },
  "bills": [
    {
      "customer_name": "Mangal Singh",
      "entries": [
        {"bags": 3, "weight_kg": 3, "name": "MMJ Yellareddy"},
        {"bags": 9, "weight_kg": 9, "name": "Narsimha Uppal"}
      ],
      "total_bags": 172,
      "total_weight": 172,
      "total_amount": 21000
    }
  ]
}

Rules:
1. Keep names in their original script — do NOT transliterate
2. If you cannot read a value, use null — do NOT guess numbers
3. Output ONLY the JSON, no other text
4. If the image has no readable text, return: {"daily_summary": {}, "bills": []}`;

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
              const parsed = JSON.parse(rawText);
              // New format: { daily_summary: {...}, bills: [...] }
              if (parsed && parsed.bills && Array.isArray(parsed.bills)) {
                return NextResponse.json({
                  bills: parsed.bills,
                  dailySummary: parsed.daily_summary || {},
                  rawText,
                });
              }
              // Old format: array of bills
              if (Array.isArray(parsed)) {
                return NextResponse.json({ bills: parsed, dailySummary: {}, rawText });
              }
              // Single bill object
              if (parsed && parsed.customer_name) {
                return NextResponse.json({ bills: [parsed], dailySummary: {}, rawText });
              }
            } catch (parseErr) {
              console.error('JSON parse failed, returning raw text:', parseErr);
              return NextResponse.json({ bills: [], dailySummary: {}, rawText });
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
