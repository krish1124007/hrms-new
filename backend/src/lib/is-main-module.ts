/**
 * "Was this module executed, or imported?" — for CLI scripts that must run
 * `main()` when started (`tsx src/scripts/x.ts`, `node dist/scripts/x.js`)
 * and stay inert when a test imports them.
 *
 * Comparing `import.meta.url` with `pathToFileURL(process.argv[1])` breaks
 * on a symlinked deploy directory (`/srv/app/current` → a release folder), a
 * relative or extension-less `argv[1]`, or a path that needs URL-escaping.
 * Both sides are resolved to their real file path instead.
 */
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSIONS = ['', '.js', '.ts', '.mjs', '.cjs'];

/** The real path of `file` (trying the usual extensions), or null when it does not exist. */
function realFile(file: string): string | null {
  for (const ext of EXTENSIONS) {
    try {
      return realpathSync(path.resolve(file + ext));
    } catch {
      // try the next extension
    }
  }
  return null;
}

/** True when the module at `moduleUrl` (`import.meta.url`) is the process entry point. */
export function isMainModule(moduleUrl: string, entry: string | undefined = process.argv[1]): boolean {
  if (!entry) return false;
  const self = realFile(fileURLToPath(moduleUrl));
  const started = realFile(entry);
  return self !== null && self === started;
}
