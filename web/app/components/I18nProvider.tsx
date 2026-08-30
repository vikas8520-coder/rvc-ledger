'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Lang, t, LANGUAGES, getOcrLangs } from '@/lib/i18n';

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  ocrLangs: string;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'all',
  setLang: () => {},
  t: (key: string) => key,
  ocrLangs: 'eng+tel+hin',
});

const STORAGE_KEY = 'rvc-lang';
const ADMIN_STORAGE_KEY = 'rvc-admin-lang';

function isAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/admin');
}

function getStorageKey(): string {
  return isAdminRoute() ? ADMIN_STORAGE_KEY : STORAGE_KEY;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en'); // Default to 'en'

  useEffect(() => {
    const storageKey = getStorageKey();
    const saved = (typeof window !== 'undefined' && localStorage.getItem(storageKey)) as Lang | null;
    if (saved && LANGUAGES.some((l) => l.value === saved)) {
      setLangState(saved);
    }
  }, []);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(), newLang);
    }
  };

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key: string) => t(lang, key),
    ocrLangs: getOcrLangs(lang),
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export { LANGUAGES };
