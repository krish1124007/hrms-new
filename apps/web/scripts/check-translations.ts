#!/usr/bin/env tsx
/**
 * CI guard: every translation file must have the same key set as the English
 * canonical file. Missing keys cause user-visible English fallbacks —
 * acceptable in a pinch, but it's better to catch them at PR time.
 *
 * Exit codes:
 *   0 — all locales match English key-for-key
 *   1 — at least one locale is missing keys (CI fails)
 *   2 — config/fs error (can't find expected files)
 *
 * Run locally:   npm run i18n:check --workspace=apps/web
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCALES_DIR = path.resolve(__dirname, '..', 'src', 'i18n', 'locales');

/** Flatten a nested JSON into `"a.b.c"` → value for easy diffing. */
function flatten(obj: unknown, prefix = ''): Record<string, string> {
  if (obj === null || typeof obj !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') {
      Object.assign(out, flatten(v, nextKey));
    } else {
      out[nextKey] = String(v);
    }
  }
  return out;
}

function main(): void {
  if (!fs.existsSync(LOCALES_DIR)) {
    console.error(`[i18n:check] locales directory not found: ${LOCALES_DIR}`);
    process.exit(2);
  }

  const locales = fs.readdirSync(LOCALES_DIR).filter((n) =>
    fs.statSync(path.join(LOCALES_DIR, n)).isDirectory(),
  );
  if (!locales.includes('en')) {
    console.error('[i18n:check] English locale missing — cannot compare');
    process.exit(2);
  }

  // Build the English key set
  const namespaces = fs
    .readdirSync(path.join(LOCALES_DIR, 'en'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  let failed = false;
  for (const ns of namespaces) {
    const enFlat = flatten(
      JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en', `${ns}.json`), 'utf8')),
    );
    const enKeys = Object.keys(enFlat);

    for (const locale of locales.filter((l) => l !== 'en')) {
      const file = path.join(LOCALES_DIR, locale, `${ns}.json`);
      if (!fs.existsSync(file)) {
        console.error(`❌ ${locale}/${ns}.json missing entirely`);
        failed = true;
        continue;
      }
      const localeFlat = flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
      const missing = enKeys.filter((k) => !(k in localeFlat));
      const extra = Object.keys(localeFlat).filter((k) => !(k in enFlat));

      if (missing.length === 0 && extra.length === 0) {
        console.log(`✅ ${locale}/${ns}.json (${enKeys.length} keys)`);
      } else {
        failed = true;
        if (missing.length) {
          console.error(`❌ ${locale}/${ns}.json missing ${missing.length} keys:`);
          for (const k of missing) console.error(`     · ${k}`);
        }
        if (extra.length) {
          console.error(`⚠  ${locale}/${ns}.json has ${extra.length} extra (no-op) keys:`);
          for (const k of extra) console.error(`     · ${k}`);
        }
      }
    }
  }

  if (failed) {
    console.error(
      '\nFix: add the missing keys to the matching locale file, or remove the extras if they were intentionally dropped from English.',
    );
    process.exit(1);
  }
  console.log('\n✅ All locales are in sync.');
}

main();
