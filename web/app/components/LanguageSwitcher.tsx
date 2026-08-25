'use client';

import { useI18n, LANGUAGES } from './I18nProvider';

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="lang" className="text-sm text-[#7a6a5a]">
        {t('language')}
      </label>
      <select
        id="lang"
        value={lang}
        onChange={(e) => setLang(e.target.value as any)}
        className="rounded-lg border border-[#c9c0b2] bg-[#f5f0e6] p-1 text-sm"
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
