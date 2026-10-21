/**
 * Every key config/env.ts reads is documented in backend/.env.example
 * (set, or commented out as `# KEY=`), so a fresh install sees all of them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('.env.example', () => {
  it('documents every key in the env schema', () => {
    const schemaKeys = [...read('./env.ts').matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]!);
    expect(schemaKeys.length).toBeGreaterThan(30);

    const example = read('../../.env.example');
    const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!));

    expect(schemaKeys.filter((key) => !documented.has(key))).toEqual([]);
  });
});
