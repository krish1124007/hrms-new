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
  public readonly code = 'CIRCUIT_OPEN';
  public readonly statusCode = 503;
  constructor(name: string) {
    super(`Circuit breaker "${name}" is open — upstream is unhealthy`);
    this.name = 'CircuitOpenError';
  }
}

interface Options {
  threshold: number;     // consecutive failures to trip
  cooldownMs: number;    // time to wait before half-open probe
  timeoutMs?: number;    // optional per-call timeout
}

type State = 'closed' | 'open' | 'half-open';

export interface Breaker {
  run<T>(fn: () => Promise<T>): Promise<T>;
  state(): State;
  reset(): void;
}

const _registry = new Map<string, Breaker>();

export function circuitBreaker(name: string, opts: Options): Breaker {
  const existing = _registry.get(name);
  if (existing) return existing;

  let state: State = 'closed';
  let failures = 0;
  let openedAt = 0;

  const b: Breaker = {
    state: () => state,
    reset: () => {
      state = 'closed';
      failures = 0;
      openedAt = 0;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
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
          ? await Promise.race<T>([
              fn(),
              new Promise<T>((_, r) =>
                setTimeout(
                  () => r(new Error(`${name} call timed out after ${opts.timeoutMs}ms`)),
                  opts.timeoutMs,
                ),
              ),
            ])
          : await fn();

        // Success — reset on probe, decrement on normal path
        if (state === 'half-open' || failures > 0) {
          logger.info({ breaker: name }, 'circuit breaker closed (upstream healthy)');
        }
        state = 'closed';
        failures = 0;
        return result;
      } catch (err) {
        failures += 1;
        if (state === 'half-open' || failures >= opts.threshold) {
          state = 'open';
          openedAt = Date.now();
          logger.warn(
            { breaker: name, failures, cooldownMs: opts.cooldownMs },
            'circuit breaker opened',
          );
        }
        throw err;
      }
    },
  };

  _registry.set(name, b);
  return b;
}

/** Test/admin helper: drop all breaker state. */
export function _resetAllBreakers(): void {
  for (const b of _registry.values()) b.reset();
  _registry.clear();
}

/** For dashboards / debugging: current state of every breaker. */
export function listBreakers(): Array<{ name: string; state: State }> {
  return [..._registry.entries()].map(([name, b]) => ({ name, state: b.state() }));
}
