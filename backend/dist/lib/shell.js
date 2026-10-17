/**
 * Run an external program without a shell.
 *
 * Arguments go straight to execve via execFile, so nothing in them (quotes,
 * `$(…)`, `;`, backticks) is ever interpreted. Errors carry the command name
 * and the start of stderr only — never the arguments, which may hold
 * connection strings with credentials.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;
const STDERR_LIMIT = 500;
/** `scheme://user:password@` → `scheme://***@` in anything we echo back. */
const URI_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s@/]+@/gi;
function describeFailure(err, timeoutMs) {
    if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
        return 'output exceeded 16 MiB';
    if (typeof err.code === 'number')
        return `exit code ${err.code}`;
    if (typeof err.code === 'string')
        return `could not start: ${err.code}`;
    if (err.killed)
        return `timed out after ${timeoutMs} ms`;
    return err.signal ? `killed by ${err.signal}` : 'failed';
}
export async function run(cmd, args, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
        await execFileAsync(cmd, args, {
            timeout: timeoutMs,
            // SIGKILL: mongodump/mongorestore treat the first SIGTERM as "shut down
            // gracefully" and can sit on a stuck connection indefinitely.
            killSignal: 'SIGKILL',
            maxBuffer: MAX_BUFFER,
            windowsHide: true,
        });
    }
    catch (caught) {
        const err = caught;
        const stderr = String(err.stderr ?? '')
            .trim()
            .replace(URI_CREDENTIALS, '$1***@')
            .slice(0, STDERR_LIMIT);
        // A fresh Error on purpose: execFile's own message embeds the full command line.
        throw new Error(`${cmd} failed (${describeFailure(err, timeoutMs)})${stderr ? `: ${stderr}` : ''}`);
    }
}
//# sourceMappingURL=shell.js.map