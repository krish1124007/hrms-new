#!/usr/bin/env tsx
/**
 * CI guard: every migration file MUST define a non-trivial `down()`.
 *
 * Running this in CI catches the most common migration bug: a dev adds
 * an `up()` to backfill data / add an index, forgets `down()`, and now
 * "migrate-mongo down" silently succeeds but leaves the DB in the new
 * state — impossible to revert without manual DB surgery.
 *
 * Rules enforced:
 *   - File exports `up` AND `down` functions
 *   - `down()` is not literally empty (no "return;" with nothing else)
 *
 * Intentional no-op down()s (like baseline) must comment-opt-out with
 * a `// @ALLOW_NOOP_DOWN` marker so the exception is visible in review.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function checkFile(file: string): string[] {
  const full = path.join(MIGRATIONS_DIR, file);
  const src = fs.readFileSync(full, 'utf8');
  const errs: string[] = [];

  if (!/async\s+up\s*\(|up\s*:\s*async/.test(src)) {
    errs.push('missing up() function');
  }
  if (!/async\s+down\s*\(|down\s*:\s*async/.test(src)) {
    errs.push('missing down() function');
  }

  // Extract the down() body. Matches both single-line ({ ... })
  // and multi-line block bodies. Non-greedy to stop at the matching brace.
  const match = src.match(/async\s+down\s*\([^)]*\)\s*\{([\s\S]*?)\n?\s*\}(?:\s*[,;])?/);
  if (match) {
    // Normalise: strip comments + collapse whitespace
    const body = match[1]
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const isNoop =
      !body ||
      /^return\s+Promise\.resolve\(\)\s*;?$/.test(body) ||
      /^return\s*;?$/.test(body) ||
      /^return\s+await\s+Promise\.resolve\(\)\s*;?$/.test(body);
    const allowNoop = /@ALLOW_NOOP_DOWN/.test(src);
    if (isNoop && !allowNoop) {
      errs.push(
        `down() appears to be a no-op. Implement rollback or add "// @ALLOW_NOOP_DOWN" with justification.`,
      );
    }
  }
  return errs;
}

function main(): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('[migrations] no migrations directory — skipping');
    return;
  }
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.cjs') || f.endsWith('.js'));
  let failed = false;
  for (const file of files) {
    const errs = checkFile(file);
    if (errs.length) {
      failed = true;
      console.error(`❌ ${file}`);
      for (const e of errs) console.error(`   - ${e}`);
    } else {
      console.log(`✅ ${file}`);
    }
  }
  if (failed) process.exit(1);
}

main();
