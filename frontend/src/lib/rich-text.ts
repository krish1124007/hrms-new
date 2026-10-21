import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/**
 * Rich text that came from other users (notices, HR policies) is rendered as
 * HTML only after it passes DOMPurify here — never raw, even when the server
 * also sanitises. Scripts, event handlers, `javascript:` URLs, iframes and
 * styles are stripped; links keep working and open in a new tab. Images load
 * only from this app's own origin or inline `data:` — a remote image would
 * tell a third party who opened the notice, when, and from where.
 */

/** `src` values an embedded image (or audio / video) may load from. */
export function isAllowedMediaSrc(src: string, origin: string = globalThis.location?.origin ?? ''): boolean {
  const value = src.trim();
  if (/^data:image\//i.test(value)) return true;
  if (!origin) return false;
  try {
    return new URL(value, origin).origin === origin;
  } catch {
    return false;
  }
}

const MEDIA_SRC_ATTRS = ['src', 'poster'] as const;

// One instance with its own options, so nothing else that imports `marked`
// changes how policies render.
const markdown = new Marked({ gfm: true, breaks: true, async: false });

let hooked = false;
function purifier(): typeof DOMPurify {
  if (!hooked) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && node.getAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      // No remote media: an element pointing anywhere but here (or data:) goes.
      for (const attr of MEDIA_SRC_ATTRS) {
        const value = node.getAttribute(attr);
        if (value !== null && node.tagName !== 'A' && !isAllowedMediaSrc(value)) {
          node.remove();
          return;
        }
      }
    });
    hooked = true;
  }
  return DOMPurify;
}

/** Safe HTML from an HTML string written by a user. */
export function sanitizeHtml(html: string): string {
  return purifier().sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    // `srcset` could name a remote image the `src` check never sees.
    FORBID_ATTR: ['style', 'srcset'],
    ADD_ATTR: ['target'],
  });
}

/** Safe HTML from Markdown (raw HTML inside it is sanitised too). */
export function markdownToSafeHtml(source: string): string {
  return sanitizeHtml(markdown.parse(source, { async: false }));
}

/** Does this text look like HTML markup rather than plain text? */
export function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}
