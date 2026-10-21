import type { Holiday } from '@/lib/systemcore.api';

export interface ParsedHoliday {
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  type: Holiday['type'];
}

const TYPES: readonly Holiday['type'][] = ['public', 'optional', 'restricted'];

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD`, `DD-MM-YYYY` or `DD/MM/YYYY` → `YYYY-MM-DD`, or null when not a real date. */
export function normaliseHolidayDate(raw: string): string | null {
  const text = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/, '$1').trim();

/**
 * Parse a pasted list or a CSV file: one holiday per line,
 * `date, name[, type]` — the type defaults to `public`. A `date,name,…`
 * header line is skipped. Lines that cannot be read are reported, not dropped
 * silently.
 */
export function parseHolidayList(text: string): { rows: ParsedHoliday[]; errors: string[] } {
  const rows: ParsedHoliday[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const fields = line.split(',').map(unquote);
    if (i === 0 && /^date$/i.test(fields[0])) return;
    const lineNo = i + 1;
    if (fields.length < 2) {
      errors.push(`Line ${lineNo}: expected "date, name"`);
      return;
    }
    const date = normaliseHolidayDate(fields[0]);
    if (!date) {
      errors.push(`Line ${lineNo}: "${fields[0]}" is not a date (use YYYY-MM-DD or DD/MM/YYYY)`);
      return;
    }
    const last = fields[fields.length - 1].toLowerCase();
    const hasType = fields.length > 2 && (TYPES as readonly string[]).includes(last);
    const name = fields.slice(1, hasType ? -1 : undefined).join(', ').trim();
    if (!name) {
      errors.push(`Line ${lineNo}: the holiday has no name`);
      return;
    }
    rows.push({ date, name, type: hasType ? (last as Holiday['type']) : 'public' });
  });
  return { rows, errors };
}
