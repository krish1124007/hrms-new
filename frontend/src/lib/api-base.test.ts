import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './api-base';

describe('resolveApiBase', () => {
  it('uses VITE_API_URL when set (trailing slash dropped)', () => {
    expect(resolveApiBase({ VITE_API_URL: 'https://hrms.ddipl.org/api/v1/', PROD: true })).toBe('https://hrms.ddipl.org/api/v1');
  });
  it('a production build without VITE_API_URL calls its own origin, never localhost', () => {
    expect(resolveApiBase({ PROD: true })).toBe('/api/v1');
    expect(resolveApiBase({ VITE_API_URL: '  ', PROD: true })).toBe('/api/v1');
  });
  it('the dev server falls back to the local API', () => {
    expect(resolveApiBase({ PROD: false })).toBe('http://localhost:4000/api/v1');
  });
});
