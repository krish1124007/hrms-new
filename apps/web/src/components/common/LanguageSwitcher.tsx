import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/i18n';

/**
 * Drop-in language picker. Persists to localStorage via i18next-browser-
 * languagedetector so the choice survives reloads. The `useDirection`
 * hook at the layout level picks up the new language and flips `<html dir>`
 * automatically — no extra plumbing here.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }): ReactElement {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as (typeof SUPPORTED_LANGUAGES)[number];

  return (
    <Select
      value={current}
      onValueChange={(v) => {
        void i18n.changeLanguage(v);
      }}
    >
      <SelectTrigger className={compact ? 'h-8 w-28' : 'w-40'} aria-label="Language">
        <Globe className="me-2 size-4 opacity-70" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
