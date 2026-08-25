export type MarketType = 'apmc' | 'rythu' | 'local' | 'other';
export type ChargeKind = 'item' | 'charge';
export type ChargeCode = 'hamali' | 'market_fee' | 'cess' | 'commission' | 'weighing' | 'other';

export interface MarketYard {
  id: string;
  name: string;
  type: MarketType;
}

export interface MarketMeta {
  marketType: MarketType;
  marketYard: string;
  sellerName: string;
  lotNo: string;
  vehicleNo: string;
}

export interface ChargeSpec {
  code: ChargeCode;
  name: string;
  amount: number;
}

export const MARKET_YARDS: MarketYard[] = [
  { id: 'bowenpally', name: 'Bowenpally (Dr. B.R. Ambedkar)', type: 'apmc' },
  { id: 'gudimalkapur', name: 'Gudimalkapur', type: 'apmc' },
  { id: 'monda', name: 'Monda Market', type: 'local' },
  { id: 'kushaiguda', name: 'Kushaiguda', type: 'local' },
  { id: 'saroornagar', name: 'Saroornagar Rythu Bazar', type: 'rythu' },
  { id: 'mehdipatnam', name: 'Mehdipatnam Rythu Bazar', type: 'rythu' },
  { id: 'madannapet', name: 'Madannapet Mandi', type: 'local' },
  { id: 'miralamm', name: 'Mir Alam Mandi', type: 'local' },
  { id: 'other', name: 'Other / not listed', type: 'other' },
];

export const EMPTY_MARKET: MarketMeta = {
  marketType: 'apmc',
  marketYard: 'bowenpally',
  sellerName: '',
  lotNo: '',
  vehicleNo: '',
};

export const DEFAULT_APMC = {
  marketFeePct: 1,
  cessOnFeePct: 0.5,
};

export const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kilo: 'kg', kilos: 'kg', kgs: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  qtl: 'qtl', quintal: 'qtl', quintals: 'qtl', qtls: 'qtl', q: 'qtl',
  tonne: 'tonne', ton: 'tonne', tons: 'tonne', mt: 'tonne',
  bag: 'bag', bags: 'bag',
  crate: 'crate', crates: 'crate',
  tray: 'tray', trays: 'tray',
  pkt: 'pkt', packet: 'pkt', packets: 'pkt',
  pcs: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs',
  bunch: 'bunch', bunches: 'bunch',
  box: 'box', boxes: 'box',
  basket: 'basket', baskets: 'basket',
  bundle: 'bundle', bundles: 'bundle',
  load: 'load', loads: 'load',
  doz: 'doz', dozen: 'doz', dozens: 'doz',
};

export const UNIT_PATTERN =
  'kg|kilos?|kgs?|g|grams?|qtl|quintals?|qtls?|tonnes?|tons?|mt|bags?|pkt|packets?|pcs|pc|pieces?|bunch(?:es)?|baskets?|boxes?|loads?|bundles?|crates?|trays?|doz(?:en)?s?|q\\b';

const CHARGE_PATTERNS: { code: ChargeCode; name: string; re: RegExp }[] = [
  { code: 'hamali', name: 'Hamali (loading)', re: /\b(hamali|hammali|loading|హమాలీ|हमाली|gunny)\b/i },
  { code: 'market_fee', name: 'Market fee', re: /\b(market\s*fee|apmc\s*fee|mandi\s*(fee|cess|shulk)|మార్కెట్\s*ఫీ|बाजार\s*शुल्क)\b/i },
  { code: 'cess', name: 'Cess', re: /\b(cess|సెస్|उपकर)\b/i },
  { code: 'commission', name: 'Commission', re: /\b(commission|arhat|arhtiya|dami|కమిషన్|कमीशन)\b/i },
  { code: 'weighing', name: 'Weighing (tulai)', re: /\b(tulai|tolai|weighing|weighment|తూకం|तोलाई)\b/i },
];

export function normalizeUnit(token: string | undefined | null): string | null {
  if (!token) return null;
  const t = token.toLowerCase().replace(/[.,;]$/, '');
  return UNIT_ALIASES[t] || null;
}

export function yardById(id: string): MarketYard | undefined {
  return MARKET_YARDS.find((y) => y.id === id);
}

export function detectMarketYard(text: string): string | null {
  const low = text.toLowerCase();
  if (/bowenpally|ambedkar/.test(low)) return 'bowenpally';
  if (/gudimalkapur|guddi\s*malkapur/.test(low)) return 'gudimalkapur';
  if (/\bmonda\b/.test(low)) return 'monda';
  if (/kushaiguda/.test(low)) return 'kushaiguda';
  if (/saroornagar/.test(low)) return 'saroornagar';
  if (/mehdipatnam/.test(low)) return 'mehdipatnam';
  if (/madannapet/.test(low)) return 'madannapet';
  if (/mir\s*alam/.test(low)) return 'miralamm';
  if (/rythu/.test(low)) return 'saroornagar';
  return null;
}

export function extractLotNo(text: string): string | null {
  const m = text.match(/\blot\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9\-\/]+)/i);
  return m ? m[1] : null;
}

export function extractVehicleNo(text: string): string | null {
  const m = text.match(/\b([A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{3,4})\b/i);
  return m ? m[1].replace(/\s+/g, '').toUpperCase() : null;
}

export function extractBillNoLoose(text: string): string | null {
  for (const line of text.split('\n')) {
    const m =
      line.match(/(?:bill|parcha|patti|invoice|inv|బిల్లు|పర్చా|పట్టీ|बिल)\s*(?:no\.?|number|నం\.?|నెం|#)?\s*:?\s*([A-Z0-9\-\/]+)/i);
    if (m) return m[1];
  }
  return null;
}

export function lastNumber(line: string): number | null {
  const nums = line.match(/(?<![0-9.])([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)(?![0-9.])/g);
  if (!nums) return null;
  return parseFloat(nums[nums.length - 1].replace(/,/g, ''));
}

export function detectCharge(line: string): ChargeSpec | null {
  for (const p of CHARGE_PATTERNS) {
    if (p.re.test(line)) {
      return { code: p.code, name: p.name, amount: lastNumber(line) || 0 };
    }
  }
  return null;
}

export function isHeaderLine(line: string): boolean {
  const low = line.toLowerCase().replace(/[^a-z\u0c00-\u0c7f\u0900-\u097f\s]/g, '').trim();
  return /^(item|items|particulars|qty|quantity|rate|amount|amt|name|s\s*no|sno)$/.test(low)
    || /qty.+rate/.test(low);
}

export function looksLikeGarbageName(name: string): boolean {
  const letters = (name.match(/[a-zA-Z\u0C00-\u0C7F\u0900-\u097F]/g) || []).length;
  const digits = (name.match(/\d/g) || []).length;
  if (letters < 3) return true;
  if (digits > letters) return true;
  if (/^[^a-zA-Z\u0C00-\u0C7F\u0900-\u097F]*$/.test(name)) return true;
  const opens = (name.match(/\(/g) || []).length;
  const closes = (name.match(/\)/g) || []).length;
  if (opens !== closes) return true;
  if (/[\/|]{2,}/.test(name)) return true;
  return false;
}

export function goodsTotal(amounts: { amount: number; kind?: ChargeKind }[]): number {
  return amounts.filter((i) => i.kind !== 'charge').reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export function chargesTotal(amounts: { amount: number; kind?: ChargeKind }[]): number {
  return amounts.filter((i) => i.kind === 'charge').reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function apmcFee(goods: number, feePct = DEFAULT_APMC.marketFeePct): number {
  return roundMoney(goods * (feePct / 100));
}

export function apmcCess(feeAmount: number, cessPct = DEFAULT_APMC.cessOnFeePct): number {
  return roundMoney(feeAmount * (cessPct / 100));
}

export function commissionOn(goods: number, pct: number): number {
  return roundMoney(goods * (pct / 100));
}

export function encodeMarketNotes(meta: MarketMeta): string {
  return JSON.stringify({
    marketType: meta.marketType,
    marketYard: meta.marketYard,
    sellerName: meta.sellerName || '',
    lotNo: meta.lotNo || '',
    vehicleNo: meta.vehicleNo || '',
  });
}

export function decodeMarketNotes(notes: string | null | undefined): Partial<MarketMeta> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && ('marketYard' in parsed || 'marketType' in parsed)) {
      return parsed as Partial<MarketMeta>;
    }
  } catch {
    /* plain-text payment notes */
  }
  return {};
}

export function chargeLabel(code: ChargeCode, extra?: string): string {
  switch (code) {
    case 'hamali':
      return 'Hamali (loading)';
    case 'market_fee':
      return extra ? `Market fee (${extra})` : 'Market fee';
    case 'cess':
      return extra ? `Cess (${extra})` : 'Cess';
    case 'commission':
      return extra ? `Commission (${extra})` : 'Commission';
    case 'weighing':
      return 'Weighing (tulai)';
    default:
      return extra || 'Charge';
  }
}
