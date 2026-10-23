import { describe, expect, it } from 'vitest';

/*
 * Field Visits replaced field sales: no screen, component, hook or API module
 * of the field module may talk about sales, orders or products any more, and
 * nothing in the app may still name the old `field-sales.*` permissions.
 */

const FIELD_SOURCES = import.meta.glob<string>(
  [
    './**/*.{ts,tsx}',
    '../../components/field/**/*.{ts,tsx}',
    '../../hooks/use-field.ts',
    '../../lib/field*.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const ALL_SOURCES = import.meta.glob<string>('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const isTest = (path: string): boolean => /\.test\.tsx?$/.test(path);

const SALES_WORDS = /\b(sales?|orders?|products?|receipts?|leaderboard|cart)\b/i;

describe('field module wording', () => {
  it('has no sales, order or product wording in field pages, components, hooks or API', () => {
    const files = Object.entries(FIELD_SOURCES).filter(([path]) => !isTest(path));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.flatMap(([path, text]) =>
      text
        .split('\n')
        .map((line, i) => ({ line, at: `${path}:${i + 1}` }))
        .filter(({ line }) => SALES_WORDS.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('no longer names the field-sales permissions anywhere', () => {
    const offenders = Object.entries(ALL_SOURCES)
      .filter(([path, text]) => !isTest(path) && text.includes('field-sales'))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
