import catalog from '../data/vegetable_catalog.json';

const SECTIONS = [
  'telangana_latin',
  'andhra_latin',
  'telugu_latin',
  'hindi_latin',
  'telangana_script',
  'andhra_script',
  'telugu_script',
  'hindi_script',
] as const;

type SectionKey = (typeof SECTIONS)[number];

const CATALOG: Record<SectionKey, Record<string, string | null>> = {
  ...catalog,
} as Record<SectionKey, Record<string, string | null>>;

export const ENGLISH_WORDS = new Set<string>();
export const ENGLISH_TO_TELUGU = new Map<string, string>();
export const ENGLISH_TO_HINDI = new Map<string, string>();

function addReverse(meaning: string | null, key: string) {
  if (!meaning) return;
  const norm = meaning.toLowerCase().trim();
  if (hindiInText(key) && !ENGLISH_TO_HINDI.has(norm)) {
    ENGLISH_TO_HINDI.set(norm, key);
  }
  if (teluguInText(key) && !ENGLISH_TO_TELUGU.has(norm)) {
    ENGLISH_TO_TELUGU.set(norm, key);
  }
  ENGLISH_WORDS.add(norm);
}

for (const section of SECTIONS) {
  for (const [k, meaning] of Object.entries(CATALOG[section] || {})) {
    addReverse(meaning, k);
  }
}

export const LATIN_TO_TELUGU = new Map<string, string>();
export const LATIN_TO_HINDI = new Map<string, string>();

function addLatin(key: string, meaning: string | null) {
  if (!meaning) return;
  if (hindiInText(key) || teluguInText(key)) return;
  const normKey = key.toLowerCase().trim().replace(/[.,;:!?]$/, '');
  if (normKey.includes(' ')) return;
  const normMeaning = meaning.toLowerCase().trim();
  if (!LATIN_TO_TELUGU.has(normKey)) {
    const tel = ENGLISH_TO_TELUGU.get(normMeaning);
    if (tel) LATIN_TO_TELUGU.set(normKey, tel);
  }
  if (!LATIN_TO_HINDI.has(normKey)) {
    const hin = ENGLISH_TO_HINDI.get(normMeaning);
    if (hin) LATIN_TO_HINDI.set(normKey, hin);
  }
}

for (const section of SECTIONS) {
  if (!section.endsWith('_latin')) continue;
  for (const [k, meaning] of Object.entries(CATALOG[section] || {})) {
    addLatin(k, meaning);
  }
}

export function teluguInText(text: string): boolean {
  return /[\u0C00-\u0C7F]/.test(text);
}

export function hindiInText(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

export function isHamali(name: string): boolean {
  return ['hamali', 'loading', 'hammali'].includes(name.trim().toLowerCase());
}

export function toTitle(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function findExact(section: SectionKey, raw: string): string | null | undefined {
  const dict = CATALOG[section];
  if (!dict) return undefined;
  return dict[raw];
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

export function fuzzyFind(
  name: string,
  section: SectionKey
): { raw: string; meaning: string | null } | null {
  const dict = CATALOG[section];
  if (!dict) return null;
  const lower = name.toLowerCase().trim();
  let best = { raw: '', score: Infinity };
  const isHindi = hindiInText(name);
  const isTelugu = teluguInText(name);
  for (const k of Object.keys(dict)) {
    if (hindiInText(k) !== isHindi || teluguInText(k) !== isTelugu) continue;
    const score = levenshtein(lower, k.toLowerCase());
    if (score < best.score) {
      best = { raw: k, score };
    }
  }
  if (best.score <= Math.max(1, name.length * 0.3)) {
    return { raw: best.raw, meaning: dict[best.raw] ?? null };
  }
  return null;
}

export interface Classification {
  script: string;
  dialect: string | null;
  guess: string | null;
}

export function classifyScript(name: string): Classification {
  const hasHindi = hindiInText(name);
  const hasTelugu = teluguInText(name);

  // Hindi script
  if (hasHindi && !hasTelugu) {
    const exact = findExact('hindi_script', name);
    if (exact !== undefined) return { script: 'hindi_script', dialect: 'hindi', guess: exact };
    const fz = fuzzyFind(name, 'hindi_script');
    if (fz) return { script: 'hindi_script', dialect: 'hindi', guess: fz.meaning };
    return { script: 'hindi_script', dialect: 'hindi', guess: null };
  }

  // Telugu script
  if (hasTelugu && !hasHindi) {
    const teluguSections: SectionKey[] = ['telangana_script', 'andhra_script', 'telugu_script'];
    for (const section of teluguSections) {
      const exact = findExact(section, name);
      if (exact !== undefined) {
        const dialect = section === 'telangana_script' ? 'telangana' : section === 'andhra_script' ? 'andhra' : 'standard';
        return { script: 'telugu_script', dialect, guess: exact };
      }
      const fz = fuzzyFind(name, section);
      if (fz) {
        const dialect = section === 'telangana_script' ? 'telangana' : section === 'andhra_script' ? 'andhra' : 'standard';
        return { script: 'telugu_script', dialect, guess: fz.meaning };
      }
    }
    return { script: 'telugu_script', dialect: 'standard', guess: null };
  }

  // Mixed or unrecognized script
  if (hasHindi && hasTelugu) {
    return { script: 'mixed_script', dialect: null, guess: null };
  }

  // Latin (English / transliteration)
  const lower = name.toLowerCase().trim();

  if (isHamali(lower)) {
    return { script: 'telugu_latin', dialect: 'telangana', guess: 'Hamali (loading)' };
  }

  const latinSections: SectionKey[] = ['telangana_latin', 'andhra_latin', 'telugu_latin', 'hindi_latin'];
  for (const section of latinSections) {
    const dict = CATALOG[section] || {};
    const exact = dict[lower];
    if (exact !== undefined) {
      const dialect =
        section === 'telangana_latin' ? 'telangana' :
        section === 'andhra_latin' ? 'andhra' :
        section === 'hindi_latin' ? 'hindi' : 'standard';
      const script = section.endsWith('_script') ? 'script' : 'latin';
      // If the word is already an English vegetable name, preserve it as-is
      if (exact && lower === exact.toLowerCase()) {
        return { script: 'english', dialect: null, guess: toTitle(name) };
      }
      return { script: `${dialect}_${script}`, dialect, guess: exact };
    }
  }

  // Fuzzy search across Latin sections
  for (const section of latinSections) {
    const fz = fuzzyFind(name, section);
    if (fz && fz.meaning) {
      const dialect =
        section === 'telangana_latin' ? 'telangana' :
        section === 'andhra_latin' ? 'andhra' :
        section === 'hindi_latin' ? 'hindi' : 'standard';
      const script = section.endsWith('_script') ? 'script' : 'latin';
      return { script: `${dialect}_${script}`, dialect, guess: fz.meaning };
    }
  }

  if (ENGLISH_WORDS.has(lower)) {
    return { script: 'english', dialect: null, guess: toTitle(name) };
  }

  return { script: 'other_uncertain', dialect: null, guess: null };
}

export function extractEnglish(confirmed: string): string {
  const m = confirmed.match(/\(([^)]+)\)$/);
  if (m) return m[1].trim();
  return confirmed.trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function localizeName(confirmed: string, lang: 'en' | 'te' | 'hi'): string {
  if (lang === 'en') return confirmed;
  const meaning = extractEnglish(confirmed).toLowerCase();
  const map = lang === 'te' ? ENGLISH_TO_TELUGU : ENGLISH_TO_HINDI;
  const latinMap = lang === 'te' ? LATIN_TO_TELUGU : LATIN_TO_HINDI;

  // Whole confirmed name is a known English meaning
  if (map.has(meaning)) return map.get(meaning)!;

  // First word is a known Latin or English raw name (e.g. "Mirchi 1 47")
  const first = confirmed.trim().split(/\s+/)[0].toLowerCase().replace(/[.,;:!?]$/, '');
  if (latinMap.has(first)) {
    const localized = latinMap.get(first)!;
    return confirmed.replace(new RegExp(`^${escapeRegExp(first)}\\b`, 'i'), localized);
  }

  return confirmed;
}

