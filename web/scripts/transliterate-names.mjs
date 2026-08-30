#!/usr/bin/env node
/**
 * Batch-transliterate existing customer names into Telugu and Hindi script
 * using the Gemini API. Same key as OCR, no new dependencies.
 *
 * Run: node scripts/transliterate-names.mjs
 *
 * What it does:
 *   1. Fetches all customers from Neon (id, name, existing telugu_name, hindi_name)
 *   2. For each customer whose telugu_name or hindi_name is missing or just a copy of name,
 *      asks Gemini to transliterate the name into Telugu script and Hindi (Devanagari).
 *   3. Prints the proposed mappings for review.
 *   4. With --commit flag, writes the results to the DB.
 */

import { neon } from '@neondatabase/serverless';

const GEMINI_MODELS = ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite'];
const API_KEY = process.env.GEMINI_API_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!API_KEY) {
  console.error('Error: GEMINI_API_KEY not set in environment');
  process.exit(1);
}
if (!DB_URL) {
  console.error('Error: DATABASE_URL not set in environment');
  process.exit(1);
}

const sql = neon(DB_URL);
const COMMIT = process.argv.includes('--commit');

// ---- Gemini call ----
async function geminiTransliterate(names) {
  const prompt = `You are a transliteration expert for Indian proper names (person names, shop names).
Given a list of names, transliterate each one into English (Latin/romanized), Telugu script, AND Hindi (Devanagari) script.
Rules:
- This is TRANSLITERATION (script conversion), NOT translation. Keep the pronunciation the same, only change the script.
- The name might already be in Telugu, English, or mixed. Detect the script and convert to all three.
- english_output: romanized Latin script (e.g. "తిరుపతి" → "Tirupathi", "ఉలవల నారాయణ" → "Ulavala Narayana"). If already in English, keep as-is.
- telugu_output: Telugu script. If already in Telugu, keep as-is.
- hindi_output: Devanagari script.
- Preserve numbers, parentheses, and punctuation as-is. Only convert the letter/script portion.
- For names like "TIRUPATHI (C 15)", english_output stays "TIRUPATHI (C 15)", telugu_output is "తిరుపతి (C 15)", hindi_output is "तिरुपति (C 15)".
- For names like "MKB భగవాన్", english_output is "MKB Bhagawan", telugu_output keeps Telugu parts, hindi_output is Devanagari.
- For names like "SRS Hostels", english_output stays "SRS Hostels", telugu_output is "ఎస్‌ఆర్‌ఎస్ హోస్టల్స్", hindi_output is "एसआरएस होस्टल्स".

Return a JSON array with this exact shape:
[{"original": "...", "english": "...", "telugu": "...", "hindi": "..."}]

Names to transliterate:
${JSON.stringify(names)}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  for (const model of GEMINI_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${endpoint}?key=${API_KEY}`, {
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
            ?.filter((p) => p.text)
            .map((p) => p.text)
            .join('\n') ||
          '';
        if (rawText && rawText.trim()) {
          return JSON.parse(rawText);
        }
      }
      console.warn(`Model ${model} returned ${response.status}, trying next...`);
    } catch (e) {
      console.warn(`Model ${model} failed: ${e.message}, trying next...`);
    }
  }
  throw new Error('All Gemini models failed');
}

// ---- Main ----
async function main() {
  console.log('Fetching customers from DB...');
  const customers = await sql`
    SELECT id, name, english_name, telugu_name, hindi_name
    FROM customers
    ORDER BY name
  `;
  console.log(`Found ${customers.length} customers.\n`);

  // Find names that need transliteration:
  // - english_name is NULL, identical to name, or contains Telugu script
  // - telugu_name is NULL or identical to name
  // - hindi_name is NULL or identical to name
  const hasTelugu = (s) => /[\u0C00-\u0C7F]/.test(s || '');
  const needsUpdate = customers.filter((c) => {
    const enBad = !c.english_name || c.english_name === c.name || hasTelugu(c.english_name);
    const teBad = !c.telugu_name || c.telugu_name === c.name;
    const hiBad = !c.hindi_name || c.hindi_name === c.name;
    return enBad || teBad || hiBad;
  });

  if (needsUpdate.length === 0) {
    console.log('All customers already have proper English, Telugu, and Hindi names. Nothing to do.');
    return;
  }

  console.log(`${needsUpdate.length} customers need transliteration.\n`);

  // Batch in groups of 15 to stay within token limits
  const BATCH_SIZE = 15;
  const results = [];

  for (let i = 0; i < needsUpdate.length; i += BATCH_SIZE) {
    const batch = needsUpdate.slice(i, i + BATCH_SIZE);
    const names = batch.map((c) => c.name);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsUpdate.length / BATCH_SIZE)}: ${names.length} names`);

    const transliterated = await geminiTransliterate(names);

    for (const c of batch) {
      const match = transliterated.find((t) => t.original === c.name);
      if (match) {
        results.push({
          id: c.id,
          name: c.name,
          english: match.english || c.english_name || c.name,
          telugu: match.telugu || c.telugu_name || c.name,
          hindi: match.hindi || c.hindi_name || c.name,
        });
        console.log(`  ${c.name}`);
        console.log(`    EN: ${match.english || '(unchanged)'}`);
        console.log(`    TE: ${match.telugu || '(unchanged)'}`);
        console.log(`    HI: ${match.hindi || '(unchanged)'}`);
      } else {
        console.warn(`  WARNING: No match for "${c.name}"`);
        results.push({
          id: c.id,
          name: c.name,
          english: c.english_name || c.name,
          telugu: c.telugu_name || c.name,
          hindi: c.hindi_name || c.name,
        });
      }
    }
    console.log('');
  }

  // Print summary
  console.log('=== Summary ===');
  console.log(`Total: ${results.length} customers`);
  console.log('');

  if (!COMMIT) {
    console.log('Dry run complete. Review the output above.');
    console.log('To write to DB, run: node scripts/transliterate-names.mjs --commit');
    return;
  }

  // Write to DB
  console.log('Writing to DB...');
  let updated = 0;
  for (const r of results) {
    await sql`
      UPDATE customers
      SET english_name = ${r.english}, telugu_name = ${r.telugu}, hindi_name = ${r.hindi}
      WHERE id = ${r.id}
    `;
    updated++;
  }
  console.log(`Updated ${updated} customers.`);
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
