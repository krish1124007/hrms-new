import { describe, expect, it } from 'vitest';
import { API_ERROR_MESSAGES, apiErrorCodeMessage, apiErrorMessage } from './api-error';

const refusal = (code: string, message = 'raw server text') => ({
  response: { status: 400, data: { success: false, error: { code, message } } },
});

describe('apiErrorMessage', () => {
  it('says the field travel / report refusals in plain words', () => {
    const codes = [
      'UNKNOWN_VEHICLE',
      'VEHICLE_RATE_NOT_SET',
      'NOTHING_TO_CLAIM',
      'TRAVEL_CLAIM_LOCKED',
      'INVALID_VISIT',
      'RANGE_TOO_LONG',
      'TA_ALREADY_CLAIMED',
      'REASON_REQUIRED',
      'NO_FIELD_WORK',
    ];
    for (const code of codes) {
      const text = apiErrorMessage(refusal(code));
      expect(text).toBe(API_ERROR_MESSAGES[code]);
      expect(text).not.toMatch(/[A-Z]{2,}_[A-Z]/); // never the code itself
    }
    expect(apiErrorMessage(refusal('VEHICLE_RATE_NOT_SET'))).toMatch(/Field settings/);
  });

  it("shows the server's own message for any other code", () => {
    expect(apiErrorMessage(refusal('VALIDATION_ERROR', 'Amount is required'))).toBe('Amount is required');
  });

  it('ignores codes that only look like object keys', () => {
    expect(apiErrorCodeMessage('constructor')).toBeUndefined();
    expect(apiErrorCodeMessage(undefined)).toBeUndefined();
  });
});
