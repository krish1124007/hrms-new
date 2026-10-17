/**
 * Why the API must not start, or null when it may. In production a missing
 * mail transport makes invitations, activations and password resets silently
 * undeliverable, so the boot is refused unless the operator opted out with
 * ALLOW_NO_MAIL=true. Development and test run on the logging transport.
 */
export function mailBootProblem(e) {
    if (e.NODE_ENV !== 'production')
        return null;
    if (e.SMTP_HOST || e.RESEND_API_KEY)
        return null;
    if (e.ALLOW_NO_MAIL === 'true')
        return null;
    return 'No mail transport configured (SMTP_HOST or RESEND_API_KEY). Set one, or ALLOW_NO_MAIL=true to boot without e-mail.';
}
//# sourceMappingURL=mail-boot-check.js.map