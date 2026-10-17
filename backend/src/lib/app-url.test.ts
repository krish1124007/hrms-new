import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { appBaseUrl } from './app-url.js';

describe('appBaseUrl', () => {
  const original = { cors: env.CORS_ORIGIN, publicBase: env.PUBLIC_BASE_URL };

  afterEach(() => {
    env.CORS_ORIGIN = original.cors;
    env.PUBLIC_BASE_URL = original.publicBase;
  });

  it('falls back to CORS_ORIGIN when PUBLIC_BASE_URL is unset', () => {
    env.PUBLIC_BASE_URL = undefined;
    env.CORS_ORIGIN = 'http://localhost:5173';
    expect(appBaseUrl()).toBe('http://localhost:5173');
  });

  it('prefers PUBLIC_BASE_URL over CORS_ORIGIN', () => {
    env.PUBLIC_BASE_URL = 'https://hrms.ddipl.org';
    env.CORS_ORIGIN = 'http://localhost:5173';
    expect(appBaseUrl()).toBe('https://hrms.ddipl.org');
  });

  it('strips trailing slashes so links never contain "//"', () => {
    env.PUBLIC_BASE_URL = 'https://hrms.ddipl.org///';
    expect(appBaseUrl()).toBe('https://hrms.ddipl.org');
    env.PUBLIC_BASE_URL = undefined;
    env.CORS_ORIGIN = 'http://localhost:5173/';
    expect(appBaseUrl()).toBe('http://localhost:5173');
  });
});
