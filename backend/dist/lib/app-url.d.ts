/**
 * Public origin of the web app, with no trailing slash. Every link e-mailed to
 * a person (invitation, activation, password reset, e-mail verification) is
 * built on it, so it must be the address a browser can actually open:
 * PUBLIC_BASE_URL when set (production: https://hrms.ddipl.org), otherwise the
 * CORS origin, which is the frontend's own address.
 */
export declare function appBaseUrl(): string;
//# sourceMappingURL=app-url.d.ts.map