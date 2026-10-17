import type { Env } from '../config/env.js';
/**
 * Why the API must not start, or null when it may. In production a missing
 * mail transport makes invitations, activations and password resets silently
 * undeliverable, so the boot is refused unless the operator opted out with
 * ALLOW_NO_MAIL=true. Development and test run on the logging transport.
 */
export declare function mailBootProblem(e: Pick<Env, 'NODE_ENV' | 'ALLOW_NO_MAIL'> & Partial<Pick<Env, 'SMTP_HOST' | 'RESEND_API_KEY'>>): string | null;
//# sourceMappingURL=mail-boot-check.d.ts.map