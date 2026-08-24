import { classifyScript, teluguInText, toTitle } from './catalog';
import { BillItem } from './types';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const UNIT_WORDS = new Set([
  'kg', 'g', 'gram', 'grams',
  'bag', 'bags', 'pkt', 'packet', 'packets',
  'pcs', 'pieces', 'bunch', 'bunches',
  'basket', 'baskets', 'box', 'boxes',
  'load', 'loads', 'bundle', 'bundles', 'crate', 'crates', 'tray', 'trays',
]);

function isUnitWord(token: string): string | null {
  const t = token.toLowerCase().replace(/[.,;]$/, '');
  if (UNIT_WORDS.has(t) || (t.endsWith('s') && UNIT_WORDS.has(t.slice(0, -1)))) {
    return token.toLowerCase();
  }
  return null;
}

export function parseDate(line: string): string | null {
  const m1 = line.match(/(\d{1,2})[/\.\-](\d{1,2})[/\.\-](\d{2,4})/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10);
    let y = parseInt(m1[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const m2 = line.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})/);
  if (m2) {
    const d = parseInt(m2[1], 10);
    const mon = m2[2].toLowerCase();
    let y = parseInt(m2[3], 10);
    if (y < 100) y += 2000;
    const mo = MONTHS[mon];
    if (mo) {
      const dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

export function extractDate(text: string): string | null {
  for (const line of text.split('\n')) {
    const d = parseDate(line);
    if (d) return d;
  }
  return null;
}

export function extractBillNo(text: string): string | null {
  for (const line of text.split('\n')) {
    const m = line.match(/bill\s*no\.?\s*:?\s*(\d+)/i);
    if (m) return m[1];
  }
  return null;
}

export function extractTotal(text: string): number | null {
  for (const line of text.split('\n')) {
    if (/\b(total|grand total|bill total)\b/i.test(line)) {
      const nums = line.match(/(?<![0-9.])([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)(?![0-9.])/g);
      if (nums) return parseFloat(nums[nums.length - 1].replace(/,/g, ''));
    }
  }
  return null;
}

function cleanLine(line: string): string {
  line = line.replace(/[₹$€£]/g, '');
  line = line.replace(/\*/g, ' x ').replace(/=/g, ' ').replace(/@/g, ' x ');
  line = line.replace(/\s+/g, ' ').trim();
  return line;
}

export function parseItemLine(line: string): BillItem | null {
  line = cleanLine(line);
  if (!line) return null;

  const low = line.toLowerCase();
  if (/\b(total|grand total|bill total)\b/.test(low)) return null;
  if (/\b(hamali|loading|hammali)\b\s*$/.test(low)) {
    return {
      raw_text: 'Hamali',
      confirmed_name: 'Hamali (loading)',
      qty: null,
      rate: null,
      amount: 0,
    };
  }

  const pattern =
    /^(.+?)\s+(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(kg|g|grams?|bags?|pkt|packets?|pcs|pieces?|bunch(?:es)?|basket(?:es)?|baskets?|box(?:es)?|load(?:s)?|bundle(?:s)?|crate(?:es)?|crate(?:s)?|tray|trays)?\s*(?:[xX/]([\d./]+\s*(?:kg|g|grams?|bags?|pkt|packets?|pcs|pieces?|bunch(?:es)?|basket(?:es)?|baskets?|box(?:es)?|load(?:s)?|bundle(?:s)?|crate(?:s)?|tray|trays)?))?\s*(?:=|-)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)?\s*$/i;

  const m = line.match(pattern);
  if (!m) return null;

  const name = m[1].trim();
  if (!/[a-zA-Z\u0C00-\u0C7F]/.test(name)) return null;

  const qty = m[2].replace(/,/g, '');
  const unit = m[3];
  const rate = m[4];
  const amount = m[5];

  let qtyStr: string | null = null;
  if (unit) {
    qtyStr = `${parseInt(qty, 10)} ${unit.toLowerCase()}`;
  } else {
    qtyStr = String(parseInt(qty, 10));
  }

  let rateStr: string | null = null;
  if (rate) {
    rateStr = rate.replace(/\s+/g, '').toLowerCase();
    if (rateStr.endsWith('/')) rateStr = rateStr.slice(0, -1);
  }

  let amountVal = 0;
  if (amount) {
    amountVal = parseFloat(amount.replace(/,/g, ''));
  } else if (rateStr) {
    const rateNum = parseFloat(rateStr.match(/\d+(?:\.\d+)?/)?.[0] || '0');
    amountVal = parseFloat(qty) * rateNum;
  } else {
    amountVal = parseFloat(qty);
    qtyStr = null;
    rateStr = null;
  }

  const { script, guess } = classifyScript(name);
  const confirmed = guess || toTitle(name);

  return {
    raw_text: name,
    confirmed_name: confirmed,
    qty: qtyStr,
    rate: rateStr,
    amount: amountVal,
    display: buildDisplay(qtyStr, rateStr, amountVal),
  };
}

export function buildDisplay(qty: string | null, rate: string | null, amount: number): string {
  if (qty && rate) return `${qty} × ${rate} = ${amount}`;
  if (qty) return `${qty} = ${amount}`;
  return String(amount);
}

export interface ParsedBill {
  date: string | null;
  billNo: string | null;
  total: number;
  items: BillItem[];
  unparsedLines: string[];
  ocrText: string;
}

export function parseBillText(text: string): ParsedBill {
  const lines = text
    .split('\n')
    .map((ln) => ln.trim())
    .filter((ln) => ln);

  const items: BillItem[] = [];
  const unparsedLines: string[] = [];

  for (const line of lines) {
    if (parseDate(line)) continue;
    if (/bill\s*no\.?\s*:?\s*\d+/i.test(line)) continue;
    if (/\b(total|grand total|bill total)\b/i.test(line)) continue;
    if (!/\d/.test(line)) continue;

    const item = parseItemLine(line);
    if (item) {
      items.push(item);
    } else {
      unparsedLines.push(line);
    }
  }

  let total = extractTotal(text);
  const itemTotal = items.reduce((s, i) => s + i.amount, 0);
  if (total === null) total = itemTotal;

  return {
    date: extractDate(text),
    billNo: extractBillNo(text),
    total,
    items,
    unparsedLines,
    ocrText: text,
  };
}
