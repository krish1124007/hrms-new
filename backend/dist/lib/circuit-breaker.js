import { logger } from '../config/logger.js';
/**
 * Minimal, dependency-free circuit breaker for outbound calls.
 *
 * Three states per breaker:
 *   - **closed**    — requests pass through; failures counted.
 *   - **open**      — trips once `failureThreshold` is reached; all
 *                     subsequent calls fail-fast for `cooldownMs`.
 *   - **half-open** — after cooldown, one probe request is allowed;
 *                     success → closed, failure → back to open.
 *
 * Why roll our own instead of using `opossum`? The app only needs two
 * knobs (threshold + cooldown) and the rest of Opossum's surface area is
 * overkill. Zero deps, ~60 lines, easy to reason about.
 *
 * Usage:
 *   const razorpayBreaker = circuitBreaker('razorpay', { threshold: 5, cooldownMs: 60_000 });
 *   const result = await razorpayBreaker.run(() => rzp.payments.capture(...));
 *
 * If the breaker is open, `run()` throws `CircuitOpenError` synchronously
 * — the callsite can surface a 503 to users with "payments degraded,
 * please retry shortly" without ever hitting the dead upstream.
 */
export class CircuitOpenError extends Error {
    code = 'CIRCUIT_OPEN';
    statusCode = 503;
    constructor(name) {
        super(`Circuit breaker "${name}" is open — upstream is unhealthy`);
        this.name = 'CircuitOpenError';
    }
}
const _registry = new Map();
export function circuitBreaker(name, opts) {
    const existing = _registry.get(name);
    if (existing)
        return existing;
    let state = 'closed';
    let failures = 0;
    let openedAt = 0;
    const b = {
        state: () => state,
        reset: () => {
            state = 'closed';
            failures = 0;
            openedAt = 0;
        },
        async run(fn) {
            // Transition open → half-open after cooldown
            if (state === 'open' && Date.now() - openedAt >= opts.cooldownMs) {
                state = 'half-open';
                logger.info({ breaker: name }, 'circuit breaker half-open — probing');
            }
            if (state === 'open') {
                throw new CircuitOpenError(name);
            }
            try {
                const result = opts.timeoutMs
                    ? await Promise.race([
                        fn(),
                        new Promise((_, r) => setTimeout(() => r(new Error(`${name} call timed out after ${opts.timeoutMs}ms`)), opts.timeoutMs)),
                    ])
                    : await fn();
                // Success — reset on probe, decrement on normal path
                if (state === 'half-open' || failures > 0) {
                    logger.info({ breaker: name }, 'circuit breaker closed (upstream healthy)');
                }
                state = 'closed';
                failures = 0;
                return result;
            }
            catch (err) {
                failures += 1;
                if (state === 'half-open' || failures >= opts.threshold) {
                    state = 'open';
                    openedAt = Date.now();
                    logger.warn({ breaker: name, failures, cooldownMs: opts.cooldownMs }, 'circuit breaker opened');
                }
                throw err;
            }
        },
    };
    _registry.set(name, b);
    return b;
}
/** Test/admin helper: drop all breaker state. */
export function _resetAllBreakers() {
    for (const b of _registry.values())
        b.reset();
    _registry.clear();
}
/** For dashboards / debugging: current state of every breaker. */
export function listBreakers() {
    return [..._registry.entries()].map(([name, b]) => ({ name, state: b.state() }));
}
//# sourceMappingURL=circuit-breaker.js.map