/**
 * The one place the product and company names live. Every user-visible
 * mention of either reads these constants, so a rename is a one-line change.
 * (`index.html` and the static privacy pages in `public/` cannot import a
 * module; they spell the same names out by hand.)
 */

/** Product name. */
export const APP_NAME = 'D-HRMS';

/** Legal company name — login page, ID cards, footers. */
export const COMPANY_NAME = 'Dharmesh Deshani Group of Companies';

/** Short company name, where the full one does not fit. */
export const COMPANY_SHORT_NAME = 'DDIPL';

/**
 * Where users write for help. Set `VITE_SUPPORT_EMAIL` at build time (the web
 * twin of the backend's `SUPPORT_EMAIL`).
 */
export const SUPPORT_EMAIL: string =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || 'info@dharmeshdeshani.com';
