import { describe, expect, it } from 'vitest';
import { isAllowedMediaSrc, markdownToSafeHtml, sanitizeHtml } from './rich-text';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('rich text images', () => {
  it('drops a remote image (a tracking pixel) but keeps same-origin and data: images', () => {
    const html = sanitizeHtml(
      `<p>Hi</p><img src="https://tracker.example/p.gif?u=1" alt="x"><img src="/api/v1/files/logo.png" alt="logo"><img src="${PNG}" alt="inline">`,
    );
    expect(html).not.toContain('tracker.example');
    expect(html).toContain('<p>Hi</p>');
    expect(html).toContain('alt="logo"');
    expect(html).toContain('alt="inline"');
  });

  it('drops protocol-relative and srcset sources, and remote images in Markdown', () => {
    expect(sanitizeHtml('<img src="//evil.example/a.png">')).toBe('');
    expect(sanitizeHtml('<img src="/ok.png" srcset="https://evil.example/a.png 2x">')).not.toContain('evil.example');
    expect(markdownToSafeHtml('![pixel](https://evil.example/p.gif)')).not.toContain('evil.example');
  });

  it('leaves links alone and opens them in a new tab', () => {
    const html = sanitizeHtml('<a href="https://example.com/policy">policy</a>');
    expect(html).toContain('href="https://example.com/policy"');
    expect(html).toContain('target="_blank"');
  });

  it('decides by origin', () => {
    const origin = 'https://hrms.example.org';
    expect(isAllowedMediaSrc('/x.png', origin)).toBe(true);
    expect(isAllowedMediaSrc('https://hrms.example.org/x.png', origin)).toBe(true);
    expect(isAllowedMediaSrc(PNG, origin)).toBe(true);
    expect(isAllowedMediaSrc('https://cdn.example.org/x.png', origin)).toBe(false);
    expect(isAllowedMediaSrc('data:text/html;base64,PHNjcmlwdD4=', origin)).toBe(false);
  });
});
