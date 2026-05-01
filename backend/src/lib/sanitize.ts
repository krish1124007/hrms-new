import sanitizeHtml from 'sanitize-html';

/**
 * HTML sanitization utilities.
 *
 * Every user-supplied HTML string — notices, blog posts, notes,
 * announcement bodies, form field descriptions — MUST pass through one of
 * these functions before being stored or displayed.
 *
 * Three presets:
 *   - strict     : text only, zero HTML allowed (strips everything)
 *   - basic      : safe inline tags (b, i, em, strong, a, br, p)
 *   - rich       : full rich-text editor output (headings, lists, images)
 */

const STRICT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

const BASIC_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span'],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    span: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  disallowedTagsMode: 'discard',
  transformTags: {
    // Force all external links to open in new tab with noopener/noreferrer
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

const RICH_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'b', 'i', 'em', 'strong', 'u', 's', 'code', 'pre',
    'a', 'img',
    'ul', 'ol', 'li',
    'blockquote', 'q',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'div', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class'],
  },
  // Global schemes — no `data:` (prevents data:text/html,... XSS in links)
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  // Only <img> may use data: URLs (for inline base64 images)
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

/** Strip all HTML — output is plain text only. Use for names, codes, single-line fields. */
export function sanitizeStrict(input: string | undefined | null): string {
  if (!input) return '';
  return sanitizeHtml(input, STRICT_OPTIONS).trim();
}

/** Allow basic inline formatting. Use for short descriptions, one-line messages. */
export function sanitizeBasic(input: string | undefined | null): string {
  if (!input) return '';
  return sanitizeHtml(input, BASIC_OPTIONS).trim();
}

/** Allow full rich-text editor output. Use for notices, announcements, blog posts, notes. */
export function sanitizeRich(input: string | undefined | null): string {
  if (!input) return '';
  return sanitizeHtml(input, RICH_OPTIONS).trim();
}

/**
 * Remove common NoSQL injection operators from any user-supplied input.
 * Apply to request body before passing to mongo queries — even though Mongoose
 * sanitizes most cases, some $-operators can still leak through object inputs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripMongoOperators(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(stripMongoOperators);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith('$') || key.includes('.')) continue; // skip $gt, $ne, and dotted-path injections
    cleaned[key] = stripMongoOperators(value);
  }
  return cleaned;
}
