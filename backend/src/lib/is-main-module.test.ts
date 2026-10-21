import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { isMainModule } from './is-main-module.js';

const made: string[] = [];
afterEach(() => {
  for (const p of made.splice(0)) fs.rmSync(p, { recursive: true, force: true });
});

function scriptDir(): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `main-${randomUUID().slice(0, 8)}-`));
  made.push(dir);
  const file = path.join(dir, 'script.js');
  fs.writeFileSync(file, '');
  return { dir, file };
}

describe('isMainModule', () => {
  it('true for the entry file, by absolute, relative or extension-less path', () => {
    const { file } = scriptDir();
    const url = pathToFileURL(file).href;
    expect(isMainModule(url, file)).toBe(true);
    expect(isMainModule(url, path.relative(process.cwd(), file))).toBe(true);
    expect(isMainModule(url, file.replace(/\.js$/, ''))).toBe(true);
  });

  it('true when the deploy directory is reached through a symlink', () => {
    const { dir, file } = scriptDir();
    const link = `${dir}-current`;
    fs.symlinkSync(dir, link);
    made.push(link);
    expect(isMainModule(pathToFileURL(file).href, path.join(link, 'script.js'))).toBe(true);
  });

  it('false when imported (another entry point, or none)', () => {
    const { file } = scriptDir();
    const other = scriptDir().file;
    expect(isMainModule(pathToFileURL(file).href, other)).toBe(false);
    expect(isMainModule(pathToFileURL(file).href, undefined)).toBe(false);
    expect(isMainModule(pathToFileURL(file).href, '/nonexistent/entry.js')).toBe(false);
  });
});
