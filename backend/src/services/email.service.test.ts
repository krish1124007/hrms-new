import { afterEach, describe, expect, it, vi } from 'vitest';

const input = { to: 'user@test.local', subject: 'Hello', html: '<p>hi</p>' };

/** Load a fresh email.service against a stubbed config (the transport is chosen at import). */
async function loadWith(envOverrides: Record<string, unknown>) {
  vi.resetModules();
  const error = vi.fn();
  vi.doMock('../config/env.js', () => ({
    env: { SMTP_FROM: 'no-reply@test.local', ...envOverrides },
  }));
  vi.doMock('../config/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error, debug: vi.fn() },
  }));
  const mod = await import('./email.service.js');
  return { ...mod, error };
}

describe('sendMail without a transport', () => {
  afterEach(() => {
    vi.doUnmock('../config/env.js');
    vi.doUnmock('../config/logger.js');
    vi.resetModules();
  });

  it('refuses to pretend success in production', async () => {
    const { sendMail, error } = await loadWith({ NODE_ENV: 'production' });
    await expect(sendMail(input)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(
      { to: input.to, subject: input.subject },
      'No mail transport configured — email NOT sent',
    );
  });

  it('keeps the logging dev transport outside production', async () => {
    for (const NODE_ENV of ['development', 'test']) {
      const { sendMail, error } = await loadWith({ NODE_ENV });
      await expect(sendMail(input)).resolves.toBe(true);
      expect(error).not.toHaveBeenCalled();
    }
  });

  it('reports the missing transport as unavailable in production, but fine in development', async () => {
    const prod = await loadWith({ NODE_ENV: 'production' });
    await expect(prod.verifyTransport()).resolves.toMatchObject({ ok: false, kind: 'dev' });

    const dev = await loadWith({ NODE_ENV: 'development' });
    await expect(dev.verifyTransport()).resolves.toEqual({ ok: true, kind: 'dev' });
  });
});
