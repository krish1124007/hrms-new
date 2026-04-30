import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRTL } from '../i18n';

/**
 * Apply `<html lang dir>` attributes based on the active i18next language.
 * Browser-native RTL does the heavy lifting (flex reverses, text align,
 * scrollbar position). We only need to set `dir` — Tailwind's logical
 * properties (`ms-`, `me-`, `ps-`, `pe-`) are already used in most
 * components, so no manual CSS flipping needed.
 *
 * Also emits the current direction so components can call `useDirection()`
 * if they need to branch (e.g. swap chevron icons).
 */
export function useDirection(): 'ltr' | 'rtl' {
  const { i18n } = useTranslation();
  const dir: 'ltr' | 'rtl' = isRTL(i18n.resolvedLanguage ?? i18n.language ?? 'en') ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.setAttribute('lang', i18n.resolvedLanguage ?? 'en');
    document.documentElement.setAttribute('dir', dir);
  }, [dir, i18n.resolvedLanguage]);

  return dir;
}
