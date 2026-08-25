import { classifyScript, toTitle } from './catalog';
import { BillItem } from './types';
import {
  detectCharge,
  detectMarketYard,
  extractBillNoLoose,
  extractLotNo,
  extractVehicleNo,
  isHeaderLine,
  looksLikeGarbageName,
  normalizeUnit,
  UNIT_PATTERN,
  yardById,
  type MarketMeta,
} from './market';

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
  return extractBillNoLoose(text);
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
  if (isHeaderLine(line)) return null;

  const charge = detectCharge(line);
  if (charge) {
    return {
      raw_text: line,
      confirmed_name: charge.name,
      qty: null,
      rate: null,
      amount: charge.amount,
      kind: 'charge',
      chargeCode: charge.code,
      display: String(charge.amount),
    };
  }

  const pattern = new RegExp(
    `^(.+?)\\s+(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})?\\s*(?:[xX/]([\\d./]+\\s*(?:${UNIT_PATTERN})?))?\\s*(?:=|-)?\\s*(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)?\\s*$`,
    'i'
  );

  const m = line.match(pattern);
  if (!m) return null;

  const name = m[1].trim();
  if (looksLikeGarbageName(name)) return null;

  const qty = m[2].replace(/,/g, '');
  const unit = normalizeUnit(m[3]);
  const rate = m[4];
  const amount = m[5];

  let qtyStr: string | null = null;
  if (unit) {
    qtyStr = `${parseFloat(qty)} ${unit}`;
  } else {
    qtyStr = String(parseFloat(qty));
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

  const { guess } = classifyScript(name);
  const confirmed = guess || toTitle(name);

  return {
    raw_text: name,
    confirmed_name: confirmed,
    qty: qtyStr,
    rate: rateStr,
    amount: amountVal,
    display: buildDisplay(qtyStr, rateStr, amountVal),
    kind: 'item',
    chargeCode: null,
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
  market: MarketMeta;
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
    if (/(?:bill|parcha|patti|invoice)\s*(?:no\.?|number|#)?\s*:?\s*[A-Z0-9\-\/]+/i.test(line)) continue;
    if (/\blot\s*(?:no\.?|number|#)?\s*:?/i.test(line)) continue;
    if (/\b(total|grand total|bill total)\b/i.test(line)) continue;
    if (isHeaderLine(line)) continue;
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

  const yardId = detectMarketYard(text) || 'bowenpally';
  const yard = yardById(yardId);

  return {
    date: extractDate(text),
    billNo: extractBillNo(text),
    total,
    items,
    unparsedLines,
    ocrText: text,
    market: {
      marketType: yard?.type || 'apmc',
      marketYard: yardId,
      sellerName: '',
      lotNo: extractLotNo(text) || '',
      vehicleNo: extractVehicleNo(text) || '',
    },
  };
}
