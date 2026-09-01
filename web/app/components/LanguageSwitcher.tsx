'use client';

import { useI18n, LANGUAGES } from './I18nProvider';

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="flex min-w-0 items-center gap-1 sm:gap-2">
      <label htmlFor="lang" className="hidden text-sm text-[var(--text-muted)] sm:inline">
        {t('language')}
      </label>
      <select
        id="lang"
        value={lang}
        onChange={(e) => setLang(e.target.value as any)}
        aria-label={t('language')}
        className="max-w-[5.5rem] min-h-11 rounded-lg border border-[var(--border-input)] bg-[var(--bg-base)] px-1 py-1 text-sm sm:max-w-none sm:px-2"
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
