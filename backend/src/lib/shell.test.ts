import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { run } from './shell.js';

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrms-shell-test-'));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('run()', () => {
  it('resolves when the command exits 0', async () => {
    await expect(run('true', [])).resolves.toBeUndefined();
  });

  it('rejects with the command name and exit code when it exits non-zero', async () => {
    await expect(run('false', [])).rejects.toThrow(/^false failed \(exit code 1\)/);
  });

  it('passes arguments through literally — no shell interpolation', async () => {
    const out = path.join(dir, 'arg.txt');
    const marker = path.join(dir, 'pwned');
    const hostile = `$(echo injected); touch ${marker} \`touch ${marker}\` "quoted" 'single'`;

    await run('sh', ['-c', 'printf %s "$1" > "$2"', '_', hostile, out]);
    expect(fs.readFileSync(out, 'utf8')).toBe(hostile);
    expect(fs.existsSync(marker)).toBe(false);

    // Metacharacters in a plain argument are not a second command either.
    await run('echo', [`hi; touch ${marker}`]);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('includes at most the first 500 characters of stderr', async () => {
    const err = await run('sh', ['-c', 'printf "%01000d" 0 | tr 0 x >&2; exit 2']).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toBe(`sh failed (exit code 2): ${'x'.repeat(500)}`);
  });

  it('never puts the arguments (or credentials echoed on stderr) in the error', async () => {
    const uri = 'mongodb://backup:t0p-s3cret@db.internal:27017/hrms';
    const err = await run('sh', ['-c', 'echo "could not connect to $1" >&2; exit 1', '_', uri]).catch(
      (e: Error) => e,
    );
    expect((err as Error).message).toContain('could not connect to mongodb://***@db.internal:27017/hrms');
    expect((err as Error).message).not.toContain('t0p-s3cret');
  });

  it('reports a command that cannot be started', async () => {
    await expect(run('definitely-not-a-real-command-hrms', [])).rejects.toThrow(
      /^definitely-not-a-real-command-hrms failed \(could not start: ENOENT\)/,
    );
  });

  it('kills the command after timeoutMs, even one that ignores SIGTERM', async () => {
    await expect(run('sleep', ['5'], { timeoutMs: 100 })).rejects.toThrow(/^sleep failed \(timed out after 100 ms\)/);

    const started = Date.now();
    await expect(run('sh', ['-c', 'trap "" TERM; exec sleep 5'], { timeoutMs: 100 })).rejects.toThrow(
      /^sh failed \(timed out after 100 ms\)/,
    );
    expect(Date.now() - started).toBeLessThan(2500);
  });
});
