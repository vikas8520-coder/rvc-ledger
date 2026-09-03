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

// ── Multi-bill PDF parser (for generated patti PDFs) ─────────────────

import type { PdfTextItem } from './paddleOcr';

export interface ParsedBill {
  customerName: string;
  billNo: string | null;
  commodity: string;
  date: string | null;
  qty: string;
  rate: string;
  amount: number;
  total: number;
}

/**
 * Parse a generated multi-bill patti PDF using text positions.
 * Each page has up to 6 bills in a 2x3 grid. Text items are grouped
 * by position into bill clusters, then each cluster is parsed.
 */
export function parseMultiBillPdf(items: PdfTextItem[]): ParsedBill[] {
  if (items.length === 0) return [];

  // Group items by page
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }

  const bills: ParsedBill[] = [];

  for (const [pageNum, pageItems] of byPage) {
    // Find "No:" markers — each one starts a new bill
    const noMarkers = pageItems.filter((i) => /^no\s*[:.]/i.test(i.text));
    if (noMarkers.length === 0) continue;

    // For each "No:" marker, find the bill region around it
    // Bills in a 2x3 grid: the "No:" marker is at the top-left of each bill
    for (const marker of noMarkers) {
      const billItems = findBillItems(marker, pageItems);
      if (billItems.length === 0) continue;

      const bill = parseBillCluster(billItems);
      if (bill) bills.push(bill);
    }
  }

  // Deduplicate — the PDF may have duplicate text layers
  const seen = new Set<string>();
  return bills.filter((b) => {
    const key = `${b.customerName}|${b.commodity}|${b.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Find all text items that belong to the same bill as the given "No:" marker.
// A bill occupies a rectangular region. We find the region by looking at
// nearby text items.
function findBillItems(marker: PdfTextItem, allItems: PdfTextItem[]): PdfTextItem[] {
  // Sort items by distance from the marker
  // A bill region is roughly 280x380 pts in a 6-per-page A4 layout
  // But we'll be more generous and cluster by proximity
  const billWidth = 280;
  const billHeight = 380;

  return allItems.filter((item) => {
    // Same page
    if (item.page !== marker.page) return false;
    // Within the bill region (marker is top-left)
    const dx = item.x - marker.x;
    const dy = marker.y - item.y; // PDF y is bottom-up, bill goes down from marker
    return dx >= -10 && dx <= billWidth && dy >= -10 && dy <= billHeight;
  }).sort((a, b) => {
    // Sort top to bottom, left to right
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 5) return yDiff;
    return a.x - b.x;
  });
}

// Parse a cluster of text items (one bill) into structured data.
function parseBillCluster(items: PdfTextItem[]): ParsedBill | null {
  if (items.length === 0) return null;

  const texts = items.map((i) => i.text);

  // Find customer name — it's the text right after "No:" line
  // Pattern: "No:" "—" "Customer Name" or "No:" "C17-19" "Customer Name"
  let customerName = '';
  let billNo: string | null = null;
  const noIdx = texts.findIndex((t) => /^no\s*[:.]/i.test(t));
  if (noIdx >= 0) {
    // Next non-dash text after "No:" is the bill number or customer name
    let idx = noIdx + 1;
    // Skip dash or empty
    while (idx < texts.length && /^[-—]+$/.test(texts[idx])) idx++;
    // If next text looks like a bill number (alphanumeric with dashes), it's billNo
    if (idx < texts.length && /^[A-Z0-9][-A-Z0-9]*$/i.test(texts[idx]) && texts[idx].length <= 10) {
      billNo = texts[idx];
      idx++;
    }
    // Next text is the customer name
    if (idx < texts.length) {
      customerName = texts[idx];
      // Skip if it's a label like "Item"
      if (/^(item|qty|rate|amt|total|produce)$/i.test(customerName)) {
        customerName = '';
      }
    }
  }

  // Find commodity — text after "Item" label
  let commodity = '';
  const itemIdx = texts.findIndex((t) => /^item$/i.test(t));
  if (itemIdx >= 0 && itemIdx + 1 < texts.length) {
    commodity = texts[itemIdx + 1];
    // Skip if it's "Produce" — use next text if available
    if (/^produce$/i.test(commodity) && itemIdx + 2 < texts.length) {
      // Check if the next text is a real commodity (not "Qty", "Rate", etc.)
      const next = texts[itemIdx + 2];
      if (!/^(qty|rate|amt|total|authorized|signatory|rvc|vegetable)$/i.test(next)) {
        commodity = next;
      }
    }
  }

  // Find date — text that looks like a date
  let date: string | null = null;
  for (const t of texts) {
    const d = parseDate(t);
    if (d) { date = d; break; }
  }

  // Find quantity — text after "Qty" label
  let qty = '';
  const qtyIdx = texts.findIndex((t) => /^qty$/i.test(t));
  if (qtyIdx >= 0 && qtyIdx + 1 < texts.length) {
    qty = texts[qtyIdx + 1];
  }

  // Find rate — text after "Rate" label
  let rate = '';
  const rateIdx = texts.findIndex((t) => /^rate$/i.test(t));
  if (rateIdx >= 0 && rateIdx + 1 < texts.length) {
    rate = texts[rateIdx + 1];
  }

  // Find amount — text after "Amt" label, or "Rs X,XXX" pattern
  let amount = 0;
  const amtIdx = texts.findIndex((t) => /^amt$/i.test(t));
  if (amtIdx >= 0 && amtIdx + 1 < texts.length) {
    amount = parseAmount(texts[amtIdx + 1]);
  }
  if (amount === 0) {
    // Fallback: look for "Rs X,XXX" pattern
    for (const t of texts) {
      if (/rs\.?\s*[\d,]+/i.test(t)) {
        amount = parseAmount(t);
        if (amount > 0) break;
      }
    }
  }

  // Find total — text after "TOTAL" label
  let total = 0;
  const totalIdx = texts.findIndex((t) => /^total$/i.test(t));
  if (totalIdx >= 0 && totalIdx + 1 < texts.length) {
    total = parseAmount(texts[totalIdx + 1]);
  }
  if (total === 0) total = amount;

  if (!customerName && amount === 0) return null;

  return {
    customerName: customerName || 'Unknown',
    billNo,
    commodity: commodity || 'Produce',
    date,
    qty,
    rate,
    amount,
    total,
  };
}

function parseAmount(str: string): number {
  let cleaned = str.replace(/[₹$€£\s]/g, '');
  cleaned = cleaned.replace(/rs\.?/i, '');
  cleaned = cleaned.replace(/,/g, '');
  return parseFloat(cleaned) || 0;
}

// ── Credit-ledger PDF parser (Mandi Ledger format) ───────────────────

export interface ParsedLedgerEntry {
  customerName: string;
  amount: number;
}

/**
 * Parse a credit-ledger (Mandi Ledger) PDF using text positions.
 * Format: two columns, each row has a serial number, customer name,
 * and amount. Header has shop name, "ALL", and date.
 * Total at the bottom.
 */
export function parseCreditLedgerPdf(items: PdfTextItem[]): ParsedLedgerEntry[] {
  if (items.length === 0) return [];

  // Group by page
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }

  const entries: ParsedLedgerEntry[] = [];

  for (const [, pageItems] of byPage) {
    // Sort top to bottom, left to right
    const sorted = [...pageItems].sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 5) return yDiff;
      return a.x - b.x;
    });

    // Find the page midpoint X to split into left/right columns
    const maxX = Math.max(...sorted.map((i) => i.x));
    const midX = maxX / 2;

    // Skip header items (shop name, "ALL", "Date:", horizontal lines)
    // and footer items (Total, footer text)
    // Header is at the top (high Y), footer at the bottom (low Y)
    const ys = sorted.map((i) => i.y);
    const maxY = Math.max(...ys);
    const minY = Math.min(...ys);

    // Data rows are between header (top ~10%) and footer (bottom ~10%)
    const headerCutoff = maxY - (maxY - minY) * 0.08;
    const footerCutoff = minY + (maxY - minY) * 0.08;

    // Group items by Y position (rows)
    const rowMap = new Map<number, PdfTextItem[]>();
    for (const item of sorted) {
      if (item.y > headerCutoff || item.y < footerCutoff) continue;
      // Skip "Total" and footer text
      if (/^total/i.test(item.text)) continue;
      if (/generated|customers|rvc vegetable/i.test(item.text)) continue;
      if (/^date\s*:/i.test(item.text)) continue;
      if (item.text === 'ALL') continue;

      // Find existing row within 5pt Y tolerance
      let rowY: number | null = null;
      for (const y of rowMap.keys()) {
        if (Math.abs(y - item.y) < 5) { rowY = y; break; }
      }
      if (rowY === null) {
        rowY = item.y;
        rowMap.set(rowY, []);
      }
      rowMap.get(rowY)!.push(item);
    }

    // Parse each row
    for (const [, rowItems] of rowMap) {
      // Sort by X position
      const rowSorted = [...rowItems].sort((a, b) => a.x - b.x);
      // A row looks like: "1" "AKULA VINOD" "4160"
      // Or: "1" "AKULA VINOD" "9848012345" "4160" (with phone)
      // Filter out serial numbers (short numeric at start)
      const texts = rowSorted.map((i) => i.text);

      // Find the amount — last numeric value in the row
      let amount = 0;
      let amountIdx = -1;
      for (let i = texts.length - 1; i >= 0; i--) {
        const num = parseAmount(texts[i]);
        if (num > 0 && /^[\d,]+$/.test(texts[i].replace(/[^\d,]/g, ''))) {
          amount = num;
          amountIdx = i;
          break;
        }
      }
      if (amount === 0) continue;

      // Customer name is everything between the serial number and the amount
      const nameParts = texts.slice(1, amountIdx);
      // Filter out phone numbers from the name
      const name = nameParts.filter((t) => !/^\d{10,}$/.test(t)).join(' ').trim();
      if (!name || name.length < 2) continue;

      entries.push({ customerName: name, amount });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.customerName}|${e.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
