import { describe, it, expect } from 'vitest';
import { isOnProbation } from './probation.js';

// Wed 14 Oct 2026, 12:00 IST.
const TODAY = new Date('2026-10-14T06:30:00.000Z');
const d = (iso: string): Date => new Date(iso);

describe('isOnProbation', () => {
  it('a probation end date after today → on probation', () => {
    expect(isOnProbation({ probationEndDate: d('2026-10-15') }, TODAY)).toBe(true);
  });

  it('a probation end date today or earlier → confirmed', () => {
    expect(isOnProbation({ probationEndDate: d('2026-10-14') }, TODAY)).toBe(false);
    expect(isOnProbation({ probationEndDate: d('2026-01-01') }, TODAY)).toBe(false);
  });

  it('the probation end date decides even when a confirmation date says otherwise', () => {
    expect(
      isOnProbation({ probationEndDate: d('2026-01-01'), confirmationDate: d('2027-01-01') }, TODAY),
    ).toBe(false);
  });

  it('no probation end date: a missing confirmation date → on probation', () => {
    expect(isOnProbation({}, TODAY)).toBe(true);
  });

  it('no probation end date: a future confirmation date → on probation; today or past → confirmed', () => {
    expect(isOnProbation({ confirmationDate: d('2026-11-01') }, TODAY)).toBe(true);
    expect(isOnProbation({ confirmationDate: d('2026-10-14') }, TODAY)).toBe(false);
    expect(isOnProbation({ confirmationDate: d('2025-04-01') }, TODAY)).toBe(false);
  });

  it('compares business days: an IST-midnight date for tomorrow is still tomorrow', () => {
    // 2026-10-14T18:30Z is 00:00 on Thu 15 Oct in IST.
    expect(isOnProbation({ probationEndDate: d('2026-10-14T18:30:00.000Z') }, TODAY)).toBe(true);
  });
});
