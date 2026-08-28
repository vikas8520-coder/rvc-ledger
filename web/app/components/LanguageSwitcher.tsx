'use client';

import { useI18n, LANGUAGES } from './I18nProvider';

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="lang" className="text-sm text-[var(--text-muted)]">
        {t('language')}
      </label>
      <select
        id="lang"
        value={lang}
        onChange={(e) => setLang(e.target.value as any)}
        className="rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] p-1 text-sm"
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
