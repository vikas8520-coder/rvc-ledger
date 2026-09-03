/**
 * Smart bill parser — takes OCR text (from PaddleOCR or Tesseract)
 * and produces structured bill data understanding the *meaning* of
 * each line: customer names, commodity names, quantities (bags/kg),
 * rates, amounts, charges, totals.
 *
 * This is the "better algorithm" layer on top of raw OCR text.
 * It understands bill structure, multilingual content, and
 * Indian market conventions.
 */

import { classifyScript, fuzzyFind, toTitle, teluguInText, hindiInText, ENGLISH_WORDS } from './catalog';
import { detectCharge, isHeaderLine, looksLikeGarbageName, normalizeUnit, UNIT_PATTERN, type ChargeKind, type ChargeCode } from './market';
import { BillItem } from './types';
import { parseDate, extractDate, extractTotal, parseItemLine, buildDisplay } from './parser';

export interface OcrLine {
  text: string;
  score: number;
  bbox?: [number, number, number, number];
}

export interface SmartBillItem {
  commodity: string;
  commodityConfirmed: string; // matched against catalog
  bags: number | null;
  weightKg: number | null;
  rate: number | null;
  rateUnit: 'per_kg' | 'per_10kg' | null;
  amount: number;
  rawText: string;
  confidence: number;
}

export interface SmartBillCharge {
  name: string;
  code: ChargeCode | null;
  amount: number;
  rawText: string;
}

export interface SmartBillResult {
  customerName: string | null;
  customerPhone: string | null;
  farmerName: string | null;
  farmerPhone: string | null;
  date: string | null;
  billNo: string | null;
  total: number;
  items: SmartBillItem[];
  charges: SmartBillCharge[];
  unparsedLines: string[];
  rawText: string;
  confidence: number; // average confidence of all lines
}

type LineType = 'header' | 'customer' | 'date' | 'bill_no' | 'item' | 'charge' | 'total' | 'unknown';

interface ClassifiedLine {
  text: string;
  score: number;
  type: LineType;
  rawIndex: number;
}

// ── Line classification ──────────────────────────────────────────────

function classifyLine(text: string, index: number, allLines: string[]): LineType {
  const low = text.toLowerCase().trim();
  if (!low) return 'unknown';

  // Date
  if (parseDate(text)) return 'date';

  // Bill number
  if (/(?:bill|parcha|patti|invoice|no\.?)\s*(?:no\.?|number|#)?\s*[:.]?\s*[A-Z0-9\-\/]{2,}/i.test(text)) return 'bill_no';
  if (/^bill\s*no/i.test(low) || /^parcha\s*no/i.test(low) || /^patti\s*no/i.test(low)) return 'bill_no';

  // Total
  if (/\b(total|grand total|bill total|net total|amount total|మొత్తం|कुल)\b/i.test(text)) return 'total';
  // Telugu total: మొత్తం
  if (teluguInText(text) && /మొత్తం/.test(text)) return 'total';
  // Hindi total: कुल
  if (hindiInText(text) && /कुल/.test(text)) return 'total';

  // Header (shop name, bill title — usually first few lines)
  if (index < 3) {
    if (isHeaderLine(text)) return 'header';
    // Lines with only text (no digits) near the top could be shop name or customer
    if (!/\d/.test(text) && text.length > 3) {
      // Check if it looks like a customer name (not a commodity)
      return 'customer';
    }
  }

  // Customer name patterns
  if (/^(to|customer|name|buyer|party|consignee|కు|नाम|ग्राहक)\s*[:.\-]/i.test(text)) return 'customer';
  if (/^to\s+/i.test(text) && !/\d{3,}/.test(text)) return 'customer';
  // Telugu "కు" (to) at start
  if (/^కు\s/.test(text)) return 'customer';
  // Hindi "नाम" (name) or "ग्राहक" (customer)
  if (/^(नाम|ग्राहक)\s*[:.\-]?/i.test(text)) return 'customer';

  // Charge lines (hamali, commission, etc.)
  const charge = detectCharge(text);
  if (charge) return 'charge';

  // Item lines (have numbers)
  if (/\d/.test(text)) {
    // Try to parse as item
    const item = parseItemLine(text);
    if (item) return 'item';

    // Lines with numbers that aren't items, charges, or totals
    // Could be lot numbers, vehicle numbers, etc. — skip those
    if (/\blot\s*(?:no\.?|number|#)?\s*:?/i.test(text)) return 'unknown';
    if (/\b(?:vehicle|lorry|truck|tempo)\s*(?:no\.?|number|#)?\s*:?/i.test(text)) return 'unknown';
  }

  // Lines without numbers after the header area
  if (!/\d/.test(text) && index >= 3) {
    // Could be a commodity name on its own line, or customer name
    // If it matches a known vegetable, it's an item
    const { guess } = classifyScript(text);
    if (guess) return 'item';
    // Otherwise, could be a customer name if it's text-only
    if (text.length > 2 && text.length < 50) return 'customer';
  }

  return 'unknown';
}

// ── Customer name extraction ─────────────────────────────────────────

function extractCustomerNameAndPhone(lines: ClassifiedLine[]): { name: string | null; phone: string | null } {
  // Look for explicitly labeled customer lines
  for (const ln of lines) {
    if (ln.type !== 'customer') continue;
    let text = ln.text;
    // Strip labels
    text = text.replace(/^(to|customer|name|buyer|party|consignee|కు|नाम|ग्राहक)\s*[:.\-]\s*/i, '');
    text = text.replace(/^(to|కు|नाम|ग्राहक)\s+/i, '');
    // Extract phone number if present (10+ digits)
    const phoneMatch = text.match(/(\d{10,})/);
    const phone = phoneMatch ? phoneMatch[1] : null;
    let name = text.replace(/(\d{10,})/, '').trim();
    if (name && name.length >= 2 && name.length <= 60) {
      return { name: toTitle(name), phone };
    }
  }

  // Fallback: first text-only line (no digits) that's not a header
  for (const ln of lines) {
    if (ln.type === 'customer' && ln.text.trim().length >= 2) {
      const text = ln.text.trim();
      const phoneMatch = text.match(/(\d{10,})/);
      const phone = phoneMatch ? phoneMatch[1] : null;
      const name = text.replace(/(\d{10,})/, '').trim();
      if (name.length >= 2) {
        return { name: toTitle(name), phone };
      }
    }
  }

  return { name: null, phone: null };
}

// Extract farmer/supplier name from bill text.
// On market bills, the supplier name often appears with labels like
// "From:", "Supplier:", "Farmer:", "నుండి", "किसान" etc.
// Also checks for phone numbers near the name.
function extractFarmerName(lines: ClassifiedLine[]): { name: string | null; phone: string | null } {
  // Look for explicitly labeled farmer/supplier lines
  const farmerLabels = /^(from|supplier|farmer|vendor|grower|నుండి|రైతు|किसान|आपूर्तिकर्ता|से)\s*[:.\-]\s*/i;
  for (const ln of lines) {
    if (ln.type === 'header' || ln.type === 'item' || ln.type === 'charge') continue;
    const match = ln.text.match(farmerLabels);
    if (match) {
      let name = ln.text.slice(match[0].length).trim();
      // Extract phone if present
      const phoneMatch = name.match(/(\d{10,})/);
      const phone = phoneMatch ? phoneMatch[1] : null;
      name = name.replace(/(\d{10,})/, '').trim();
      if (name && name.length >= 2 && name.length <= 60) {
        return { name: toTitle(name), phone };
      }
    }
  }

  // Fallback: look for lines with "From" or supplier-like keywords
  for (const ln of lines) {
    if (ln.type === 'header' || ln.type === 'item' || ln.type === 'charge') continue;
    const lower = ln.text.toLowerCase();
    if (lower.startsWith('from ') || lower.startsWith('supplier ') || lower.startsWith('farmer ')) {
      let name = ln.text.replace(/^(from|supplier|farmer)\s+/i, '').trim();
      const phoneMatch = name.match(/(\d{10,})/);
      const phone = phoneMatch ? phoneMatch[1] : null;
      name = name.replace(/(\d{10,})/, '').trim();
      if (name && name.length >= 2 && name.length <= 60) {
        return { name: toTitle(name), phone };
      }
    }
  }

  return { name: null, phone: null };
}

// ── Commodity matching ───────────────────────────────────────────────

function matchCommodity(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return rawName;

  // Try runtime aliases and catalog matching
  const { guess } = classifyScript(trimmed);
  if (guess) return guess;

  // Try fuzzy matching against all catalog sections
  for (const section of ['telangana_latin', 'andhra_latin', 'telugu_latin', 'hindi_latin'] as const) {
    const fz = fuzzyFind(trimmed, section);
    if (fz?.meaning) return fz.meaning;
  }

  // If it contains Telugu or Hindi script, try script sections
  if (teluguInText(trimmed)) {
    const fz = fuzzyFind(trimmed, 'telugu_script');
    if (fz?.meaning) return fz.meaning;
  }
  if (hindiInText(trimmed)) {
    const fz = fuzzyFind(trimmed, 'hindi_script');
    if (fz?.meaning) return fz.meaning;
  }

  // No match — return cleaned title case
  return toTitle(trimmed);
}

// ── Quantity extraction (bags + kg) ──────────────────────────────────

function extractQty(qtyStr: string): { bags: number | null; weightKg: number | null } {
  const result = { bags: null as number | null, weightKg: null as number | null };
  if (!qtyStr) return result;

  // "5 bags" or "5 bag"
  const bagsMatch = qtyStr.match(/(\d+(?:\.\d+)?)\s*bag/i);
  if (bagsMatch) result.bags = parseFloat(bagsMatch[1]);

  // "50 kg" or "50kg" or "50.5 kgs"
  const kgMatch = qtyStr.match(/([\d.]+)\s*kg/i);
  if (kgMatch) result.weightKg = parseFloat(kgMatch[1]);

  // If just a number with no unit, it could be bags or kg
  // In APMC context, small numbers (< 20) are likely bags, larger are kg
  if (!result.bags && !result.weightKg) {
    const justNum = qtyStr.match(/^(\d+(?:\.\d+)?)$/);
    if (justNum) {
      const n = parseFloat(justNum[1]);
      if (n <= 100) result.bags = n;
      else result.weightKg = n;
    }
  }

  return result;
}

// ── Rate extraction ──────────────────────────────────────────────────

function extractRate(rateStr: string): { rate: number | null; unit: 'per_kg' | 'per_10kg' | null } {
  if (!rateStr) return { rate: null, unit: null };

  const low = rateStr.toLowerCase();
  const numMatch = rateStr.match(/([\d.]+)/);
  if (!numMatch) return { rate: null, unit: null };
  const rate = parseFloat(numMatch[1]);

  // Detect unit from string
  if (/10\s*kg|per\s*10|\/10/.test(low)) return { rate, unit: 'per_10kg' };
  if (/kg|per\s*kg|\/kg/.test(low)) return { rate, unit: 'per_kg' };

  // In APMC context, rates like 220, 230, 450 are typically per 10kg
  // Rates like 22, 23, 45 are typically per kg
  if (rate >= 100) return { rate, unit: 'per_10kg' };
  if (rate >= 5) return { rate, unit: 'per_kg' };

  return { rate, unit: null };
}

// ── Number parsing (Indian format) ───────────────────────────────────

function parseIndianNumber(str: string): number {
  // Remove ₹, commas, spaces
  let cleaned = str.replace(/[₹$€£,\s]/g, '');
  // Handle Indian number format: 1,00,000 → 100000
  cleaned = cleaned.replace(/,(\d{2})(\d{3})$/, '$1$2');
  return parseFloat(cleaned) || 0;
}

// ── Main parsing function ────────────────────────────────────────────

export function parseBillSmart(
  ocrText: string,
  ocrLines?: OcrLine[],
): SmartBillResult {
  // If we have structured OCR lines with confidence, use them
  const lines: ClassifiedLine[] = [];
  const textLines = ocrText.split('\n').map((l) => l.trim()).filter(Boolean);

  if (ocrLines && ocrLines.length > 0) {
    for (let i = 0; i < ocrLines.length; i++) {
      const ln = ocrLines[i];
      if (!ln.text.trim()) continue;
      lines.push({
        text: ln.text.trim(),
        score: ln.score || 0.5,
        type: classifyLine(ln.text.trim(), i, textLines),
        rawIndex: i,
      });
    }
  } else {
    // Fallback: parse plain text (no confidence scores)
    for (let i = 0; i < textLines.length; i++) {
      const text = textLines[i];
      lines.push({
        text,
        score: 0.5, // unknown confidence
        type: classifyLine(text, i, textLines),
        rawIndex: i,
      });
    }
  }

  // Extract structured data
  const customerInfo = extractCustomerNameAndPhone(lines);
  const customerName = customerInfo.name;
  const farmerInfo = extractFarmerName(lines);
  const date = extractDate(ocrText);
  const total = extractTotal(ocrText);

  const items: SmartBillItem[] = [];
  const charges: SmartBillCharge[] = [];
  const unparsedLines: string[] = [];

  for (const ln of lines) {
    if (ln.type === 'item') {
      const parsed = parseItemLine(ln.text);
      if (parsed) {
        const qtyInfo = extractQty(parsed.qty || '');
        const rateInfo = extractRate(parsed.rate || '');

        const commodityRaw = parsed.confirmed_name || parsed.raw_text;
        const commodityConfirmed = matchCommodity(commodityRaw);

        items.push({
          commodity: commodityRaw,
          commodityConfirmed,
          bags: qtyInfo.bags,
          weightKg: qtyInfo.weightKg,
          rate: rateInfo.rate,
          rateUnit: rateInfo.unit,
          amount: parsed.amount,
          rawText: ln.text,
          confidence: ln.score,
        });
      } else {
        unparsedLines.push(ln.text);
      }
    } else if (ln.type === 'charge') {
      const charge = detectCharge(ln.text);
      if (charge) {
        charges.push({
          name: charge.name,
          code: charge.code,
          amount: charge.amount,
          rawText: ln.text,
        });
      }
    } else if (ln.type === 'unknown') {
      // Try one more time to parse as item
      const parsed = parseItemLine(ln.text);
      if (parsed && (parsed.amount > 0 || parsed.qty)) {
        const qtyInfo = extractQty(parsed.qty || '');
        const rateInfo = extractRate(parsed.rate || '');
        const commodityRaw = parsed.confirmed_name || parsed.raw_text;
        items.push({
          commodity: commodityRaw,
          commodityConfirmed: matchCommodity(commodityRaw),
          bags: qtyInfo.bags,
          weightKg: qtyInfo.weightKg,
          rate: rateInfo.rate,
          rateUnit: rateInfo.unit,
          amount: parsed.amount,
          rawText: ln.text,
          confidence: ln.score,
        });
      } else {
        unparsedLines.push(ln.text);
      }
    }
  }

  // Calculate total if not found
  const itemTotal = items.reduce((s, i) => s + i.amount, 0);
  const chargeTotal = charges.reduce((s, c) => s + c.amount, 0);
  const finalTotal = total !== null ? total : itemTotal + chargeTotal;

  // Average confidence
  const avgConfidence = lines.length > 0
    ? lines.reduce((s, l) => s + l.score, 0) / lines.length
    : 0;

  return {
    customerName,
    customerPhone: customerInfo.phone,
    farmerName: farmerInfo.name,
    farmerPhone: farmerInfo.phone,
    date,
    billNo: null,
    total: finalTotal,
    items,
    charges,
    unparsedLines,
    rawText: ocrText,
    confidence: avgConfidence,
  };
}
