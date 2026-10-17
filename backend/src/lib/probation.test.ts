import { describe, it, expect } from 'vitest';
import { addBusinessMonths, isOnProbation } from './probation.js';

// Wed 14 Oct 2026, 12:00 IST.
const TODAY = new Date('2026-10-14T06:30:00.000Z');
const d = (iso: string): Date => new Date(iso);
/** Noon IST on a calendar day. */
const noonIst = (iso: string): Date => new Date(`${iso}T12:00:00.000+05:30`);

describe('isOnProbation — probationEndDate decides when set', () => {
  it('ending today → confirmed; ending tomorrow → on probation', () => {
    expect(isOnProbation({ probationEndDate: d('2026-10-14'), joiningDate: d('2026-09-01') }, TODAY)).toBe(false);
    expect(isOnProbation({ probationEndDate: d('2026-10-15'), joiningDate: d('2024-01-15') }, TODAY)).toBe(true);
  });

  it('wins over a confirmation date and the joining date', () => {
    expect(
      isOnProbation(
        { probationEndDate: d('2026-01-01'), confirmationDate: d('2027-01-01'), joiningDate: d('2026-09-01') },
        TODAY,
      ),
    ).toBe(false);
  });

  it('compares business days: an IST-midnight date for tomorrow is still tomorrow', () => {
    // 2026-10-14T18:30Z is 00:00 on Thu 15 Oct in IST.
    expect(isOnProbation({ probationEndDate: d('2026-10-14T18:30:00.000Z') }, TODAY)).toBe(true);
  });
});

describe('isOnProbation — else confirmationDate', () => {
  it('a past confirmation date → confirmed, even for a recent joiner', () => {
    expect(isOnProbation({ confirmationDate: d('2026-10-01'), joiningDate: d('2026-09-01') }, TODAY)).toBe(false);
  });

  it('a future confirmation date → on probation, even for a long-serving employee', () => {
    expect(isOnProbation({ confirmationDate: d('2026-11-01'), joiningDate: d('2024-01-15') }, TODAY)).toBe(true);
  });
});

describe(`isOnProbation — else joiningDate + 6 months`, () => {
  it('no dates, joined 7 months ago → not on probation', () => {
    expect(isOnProbation({ joiningDate: d('2026-03-14') }, TODAY)).toBe(false);
  });

  it('no dates, joined 2 months ago → on probation', () => {
    expect(isOnProbation({ joiningDate: d('2026-08-14') }, TODAY)).toBe(true);
  });

  it('exactly six months to the day → confirmed that day; one day short → still on probation', () => {
    expect(isOnProbation({ joiningDate: d('2026-04-14') }, TODAY)).toBe(false);
    expect(isOnProbation({ joiningDate: d('2026-04-15') }, TODAY)).toBe(true);
  });

  it('month end clamps: joined 31 Aug 2026 → probation ends 28 Feb 2027', () => {
    const joined = { joiningDate: d('2026-08-31') };
    expect(addBusinessMonths(joined.joiningDate, 6).toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(isOnProbation(joined, noonIst('2027-02-27'))).toBe(true);
    expect(isOnProbation(joined, noonIst('2027-02-28'))).toBe(false);
  });

  it('month end clamps to 29 Feb in a leap year: joined 31 Aug 2027 → ends 29 Feb 2028', () => {
    const joined = { joiningDate: d('2027-08-31') };
    expect(addBusinessMonths(joined.joiningDate, 6).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(isOnProbation(joined, noonIst('2028-02-28'))).toBe(true);
    expect(isOnProbation(joined, noonIst('2028-02-29'))).toBe(false);
  });

  it('a joining date stored at IST midnight (previous day in UTC) counts from the day it names', () => {
    // 2026-04-14T18:30Z is 00:00 on 15 Apr in IST → probation ends 15 Oct.
    expect(isOnProbation({ joiningDate: d('2026-04-14T18:30:00.000Z') }, TODAY)).toBe(true);
  });
});
