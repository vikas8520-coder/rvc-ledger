import catalog from '../data/vegetable_catalog.json';

export const BASE_CATALOG: Record<string, string | null> = {
  ...catalog.telugu_latin,
  ...catalog.telugu_script,
};

export const ENGLISH_WORDS = new Set<string>();
for (const v of Object.values(BASE_CATALOG)) {
  if (v) ENGLISH_WORDS.add(v.toLowerCase());
}

export function teluguInText(text: string): boolean {
  return /[\u0C00-\u0C7F]/.test(text);
}

export function isHamali(name: string): boolean {
  return ['hamali', 'loading', 'hammali'].includes(name.trim().toLowerCase());
}

export function classifyScript(name: string): { script: string; guess: string | null } {
  if (teluguInText(name)) {
    const exact = BASE_CATALOG[name];
    if (exact) return { script: 'telugu_script', guess: exact };
    return { script: 'telugu_script', guess: null };
  }

  const lower = name.toLowerCase().trim();
  if (isHamali(lower)) {
    return { script: 'telugu_latin', guess: 'Hamali (loading)' };
  }

  const exact = BASE_CATALOG[lower];
  if (exact !== undefined) {
    if (exact && lower === exact.toLowerCase()) {
      return { script: 'english', guess: name };
    }
    if (exact) {
      return { script: 'telugu_latin', guess: `${toTitle(name)} (${exact})` };
    }
    return { script: 'telugu_latin', guess: toTitle(name) };
  }

  if (ENGLISH_WORDS.has(lower)) {
    return { script: 'english', guess: name };
  }

  return { script: 'other_uncertain', guess: null };
}

export function toTitle(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function fuzzyFind(
  name: string,
  catalog: Record<string, string | null>
): { raw: string; meaning: string | null } | null {
  const lower = name.toLowerCase().trim();
  let best = { raw: '', score: Infinity };
  for (const [k, v] of Object.entries(catalog)) {
    if (teluguInText(k) !== teluguInText(name)) continue;
    const score = levenshtein(lower, k.toLowerCase());
    if (score < best.score) {
      best = { raw: k, score };
    }
  }
  if (best.score <= Math.max(1, name.length * 0.3)) {
    return { raw: best.raw, meaning: catalog[best.raw] ?? null };
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}
