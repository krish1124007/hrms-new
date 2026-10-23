import { describe, expect, it } from 'vitest';
import type { RouteLeg } from './field-reports.api';
import {
  formatKm,
  isRouteEstimated,
  kmNeedsReason,
  legsTotalKm,
  travelAmount,
} from './field-route';

describe('legsTotalKm', () => {
  it('adds the legs in kilometres', () => {
    const legs: RouteLeg[] = [
      { fromIndex: 0, toIndex: 1, distanceM: 5000, estimated: false },
      { fromIndex: 1, toIndex: 2, distanceM: 7450, estimated: false },
    ];
    expect(legsTotalKm(legs)).toBeCloseTo(12.45);
    expect(legsTotalKm([])).toBe(0);
  });
});

describe('isRouteEstimated', () => {
  it('is true when the route or any leg is estimated', () => {
    const leg: RouteLeg = { fromIndex: 0, toIndex: 1, distanceM: 10, estimated: false };
    expect(isRouteEstimated({ estimated: false, legs: [leg] })).toBe(false);
    expect(isRouteEstimated({ estimated: false, legs: [leg, { ...leg, estimated: true }] })).toBe(true);
    expect(isRouteEstimated({ estimated: true, legs: [] })).toBe(true);
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
