import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/**
 * Rich text that came from other users (notices, HR policies) is rendered as
 * HTML only after it passes DOMPurify here — never raw, even when the server
 * also sanitises. Scripts, event handlers, `javascript:` URLs, iframes and
 * styles are stripped; links keep working and open in a new tab.
 */

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
    FORBID_ATTR: ['style'],
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
