// Fails the build when the bundle points at a developer machine: a dist built
// without frontend/.env once shipped `http://localhost:4000/api/v1` to the
// live site, and every API call failed.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist/assets/', import.meta.url).pathname;
const bad = /(?:localhost|127\.0\.0\.1):4000/;
const hits = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => bad.test(readFileSync(join(dir, f), 'utf8')));
if (hits.length) {
  console.error(`check-dist: the bundle calls a local API (localhost:4000) in: ${hits.join(', ')}`);
  console.error('Set VITE_API_URL in frontend/.env (or leave it unset for same-origin /api/v1) and build again.');
  process.exit(1);
}
console.log('check-dist: no local API address in the bundle');
