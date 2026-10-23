import { describe, expect, it } from 'vitest';
import { formatKm, kmNeedsReason, travelAmount, travelSummary } from './field-route';

describe('travelSummary', () => {
  it('says the claimed km and the vehicle', () => {
    expect(travelSummary({ claimedKm: 50, vehicleType: 'bike' })).toBe('50 km · Two-wheeler');
    expect(travelSummary({ claimedKm: 12.46, vehicleType: 'car' })).toBe('12.5 km · Car');
  });
});

describe('kmNeedsReason', () => {
  it('asks for a reason only when the claimed km is more than 5 % away from the calculated km', () => {
    expect(kmNeedsReason(40, undefined)).toBe(false);
    expect(kmNeedsReason(40, 40)).toBe(false);
    expect(kmNeedsReason(40, 42)).toBe(false); // exactly 5 %
    expect(kmNeedsReason(40, 42.1)).toBe(true);
    expect(kmNeedsReason(40, 37.9)).toBe(true);
  });

  it('asks for a reason for any km when nothing was calculated', () => {
    expect(kmNeedsReason(0, 0)).toBe(false);
    expect(kmNeedsReason(0, 3)).toBe(true);
  });
});

describe('travelAmount', () => {
  it('is km × rate, rounded to whole rupees', () => {
    expect(travelAmount(42.3, 5)).toBe(212);
    expect(travelAmount(10, 0)).toBe(0);
  });
});

describe('formatKm', () => {
  it('shows one decimal', () => {
    expect(formatKm(12.46)).toBe('12.5 km');
    expect(formatKm(1234.5)).toBe('1,234.5 km');
    expect(formatKm(0)).toBe('0.0 km');
  });
});
