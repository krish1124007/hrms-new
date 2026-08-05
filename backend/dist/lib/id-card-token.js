/**
 * ID-card verification codes.
 *
 * The QR on an employee's card points at a public verify page, so the code in
 * that URL has to be unforgeable — otherwise anyone could mint a link for any
 * employee id and get back a "verified" page for someone they are not.
 *
 * The code is `<employeeId>.<hmac>`: stateless (nothing to store or expire),
 * short enough to keep the QR low-density, and impossible to produce without
 * the server secret. It carries no personal data itself — it is only a
 * lookup key, so a photographed card leaks nothing on its own.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
/** 22 base64url chars ≈ 132 bits — far beyond brute force, still compact. */
const SIG_LENGTH = 22;
function signature(employeeId) {
    return createHmac('sha256', env.JWT_SECRET)
        .update(`id-card:${employeeId}`)
        .digest('base64url')
        .slice(0, SIG_LENGTH);
}
/** Build the verification code that goes inside an employee's QR. */
export function signEmployeeCode(employeeId) {
    return `${employeeId}.${signature(employeeId)}`;
}
/** Return the employee id a code vouches for, or null if it is not genuine. */
export function verifyEmployeeCode(code) {
    const dot = code.lastIndexOf('.');
    if (dot <= 0)
        return null;
    const employeeId = code.slice(0, dot);
    const provided = code.slice(dot + 1);
    const expected = signature(employeeId);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    // Length check first — timingSafeEqual throws on a mismatch.
    if (a.length !== b.length || !timingSafeEqual(a, b))
        return null;
    return employeeId;
}
//# sourceMappingURL=id-card-token.js.map