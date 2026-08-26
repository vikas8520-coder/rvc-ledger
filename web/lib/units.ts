import { normalizeUnit } from './market';
import { classifyScript, extractEnglish } from './catalog';

export interface Qty {
  value: number;
  unit: string | null;
}

/** Weight units we can safely convert to kilograms. */
const TO_KG: Record<string, number> = {
  kg: 1,
  g: 0.001,
  qtl: 100,
  tonne: 1000,
};

/** "55 kg" -> { value: 55, unit: 'kg' }; "40" -> { value: 40, unit: null } */
export function parseQty(qty: string | null | undefined): Qty | null {
  if (!qty) return null;
  const m = String(qty).trim().match(/^([\d.,]+)\s*([A-Za-z]+)?/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return { value, unit: normalizeUnit(m[2]) };
}

/**
 * Rate per single unit. Handles "47", "130/10kg" (=13/kg), "40/10" (=4).
 * Returns null when the text carries no usable number.
 */
export function parseRate(rate: string | null | undefined): { value: number; unit: string | null } | null {
  if (!rate) return null;
  const text = String(rate).trim().toLowerCase().replace(/[₹\s]/g, '');
  if (!text) return null;

  const per = text.match(/^([\d.,]+)\/([\d.,]*)([a-z]+)?$/);
  if (per) {
    const amount = parseFloat(per[1].replace(/,/g, ''));
    const perQty = per[2] ? parseFloat(per[2].replace(/,/g, '')) : 1;
    if (!Number.isFinite(amount) || !Number.isFinite(perQty) || perQty === 0) return null;
    return { value: amount / perQty, unit: normalizeUnit(per[3]) };
  }

  const plain = text.match(/^([\d.,]+)([a-z]+)?$/);
  if (plain) {
    const value = parseFloat(plain[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) return null;
    return { value, unit: normalizeUnit(plain[2]) };
  }
  return null;
}

/** Converts a quantity to kilograms when the unit is a weight, else null. */
export function toKg(q: Qty | null): number | null {
  if (!q || !q.unit) return null;
  const factor = TO_KG[q.unit];
  if (!factor) return null;
  return q.value * factor;
}

/**
 * Groups quantities into a comparable basis: weights collapse to "kg",
 * countable units (bag, crate, pcs...) keep their own basis.
 */
export function qtyBasis(q: Qty | null): { unit: string; value: number } | null {
  if (!q) return null;
  const kg = toKg(q);
  if (kg !== null) return { unit: 'kg', value: kg };
  if (q.unit) return { unit: q.unit, value: q.value };
  return null;
}

/**
 * Resolves a name to its canonical English meaning via the catalog.
 * Falls back to the raw name (lowercased, parenthesised gloss stripped)
 * when no catalog match is found.
 *
 * "Mirchi" -> "chili", "మిర్చి" -> "chili", "Chili" -> "chili"
 */
export function itemKey(name: string): string {
  if (!name) return '';
  const { guess } = classifyScript(name);
  const base = guess ? extractEnglish(guess).toLowerCase() : name.replace(/\(([^)]*)\)/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return base || name.trim().toLowerCase();
}

/**
 * Returns the canonical English title for display, resolving through
 * the catalog when possible. Keeps the original name as fallback.
 */
export function canonicalName(name: string): string {
  if (!name) return '';
  const { guess } = classifyScript(name);
  return guess || name;
}
