import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/i18n';

/**
 * Drop-in language picker. Persists to localStorage via i18next-browser-
 * languagedetector so the choice survives reloads.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }): ReactElement {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as (typeof SUPPORTED_LANGUAGES)[number];

  return (
    <div className="relative flex items-center">
      <Globe className="absolute left-3 size-4 opacity-70 pointer-events-none" />
      <Select
        value={current}
        onChange={(e) => {
          void i18n.changeLanguage(e.target.value);
        }}
        className={compact ? 'h-8 w-28 pl-9' : 'w-40 pl-9'}
        aria-label="Language"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </option>
        ))}
      </Select>
    </div>
  );
}
