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
for (const section of SECTIONS) {
  for (const v of Object.values(CATALOG[section] || {})) {
    if (v) ENGLISH_WORDS.add(v.toLowerCase());
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
