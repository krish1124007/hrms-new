import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';
import { privacyPolicyHtml } from './privacy-policy.js';

describe('privacy policy', () => {
  it('is public, carries the D-HRMS / company branding and no old brand', async () => {
    const res = await request(createApp()).get('/api/v1/privacy-policy');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('D-HRMS');
    expect(res.text).toContain('Dharmesh Deshani Group of Companies');
    expect(res.text).not.toMatch(/tankar|fieldora|DD HRMS/i);
  });

  it('shows the support address, escaped, or a fallback without one', () => {
    expect(privacyPolicyHtml('help@ddipl.org')).toContain('mailto:help@ddipl.org');
    expect(privacyPolicyHtml('a<b@x.org')).toContain('a&lt;b@x.org');
    expect(privacyPolicyHtml(null)).toContain('Contact your HR department.');
  });
});
