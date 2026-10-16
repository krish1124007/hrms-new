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
export declare class CircuitOpenError extends Error {
    readonly code = "CIRCUIT_OPEN";
    readonly statusCode = 503;
    constructor(name: string);
}
interface Options {
    threshold: number;
    cooldownMs: number;
    timeoutMs?: number;
}
type State = 'closed' | 'open' | 'half-open';
export interface Breaker {
    run<T>(fn: () => Promise<T>): Promise<T>;
    state(): State;
    reset(): void;
}
export declare function circuitBreaker(name: string, opts: Options): Breaker;
/** Test/admin helper: drop all breaker state. */
export declare function _resetAllBreakers(): void;
/** For dashboards / debugging: current state of every breaker. */
export declare function listBreakers(): Array<{
    name: string;
    state: State;
}>;
export {};
//# sourceMappingURL=circuit-breaker.d.ts.map