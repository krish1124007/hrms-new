import { describe, expect, it } from 'vitest';
import { mailBootProblem } from './mail-boot-check.js';

const base = { NODE_ENV: 'production', ALLOW_NO_MAIL: 'false' } as const;

describe('mailBootProblem', () => {
  it('refuses a production boot with no mail transport', () => {
    expect(mailBootProblem({ ...base })).toMatch(/SMTP_HOST or RESEND_API_KEY/);
    expect(mailBootProblem({ ...base, SMTP_HOST: '', RESEND_API_KEY: '' })).toMatch(/SMTP_HOST/);
  });

  it('accepts SMTP or Resend', () => {
    expect(mailBootProblem({ ...base, SMTP_HOST: 'smtp.example.com' })).toBeNull();
    expect(mailBootProblem({ ...base, RESEND_API_KEY: 're_123' })).toBeNull();
  });

  it('accepts an explicit ALLOW_NO_MAIL=true opt-out', () => {
    expect(mailBootProblem({ ...base, ALLOW_NO_MAIL: 'true' })).toBeNull();
  });

  it('never blocks development or test', () => {
    expect(mailBootProblem({ NODE_ENV: 'development', ALLOW_NO_MAIL: 'false' })).toBeNull();
    expect(mailBootProblem({ NODE_ENV: 'test', ALLOW_NO_MAIL: 'false' })).toBeNull();
  });
});
