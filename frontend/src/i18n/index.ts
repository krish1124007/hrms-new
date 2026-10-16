import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import hiCommon from './locales/hi/common.json';
import arCommon from './locales/ar/common.json';

/**
 * i18n configuration.
 *
 *   - **English** is the canonical source of truth. Missing keys in other
 *     languages fall back to English, so partial translations ship safely.
 *   - **Hindi** and **Arabic** cover the two largest target markets beyond
 *     English. Arabic is RTL — `isRTL(lang)` + the layout hook toggle the
 *     `dir` attribute on <html>.
 *   - Language resolution order:
 *       1. URL query `?lang=xx` (useful for support testing a user's view)
 *       2. localStorage
 *       3. Browser `navigator.language`
 *       4. Fallback: `en`
 *   - Bundled (not async-loaded) — our locale payload is < 3 KB per language
 *     gzipped, so the build-time import is simpler and faster than a network
 *     fetch on first paint.
 */

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
  ar: 'العربية',
};

const RTL_LANGUAGES = new Set<SupportedLanguage>(['ar']);

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.has(lang as SupportedLanguage);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      hi: { common: hiCommon },
      ar: { common: arCommon },
    },
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'ddhrms.language',
      caches: ['localStorage'],
    },
    // In dev, log keys that fall back to English so we notice gaps quickly.
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] missing "${String(key)}" in ${lngs.join(',')} / ${ns}`);
        }
      : undefined,
  });

export default i18n;
