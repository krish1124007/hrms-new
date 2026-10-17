/**
 * Statutory rules — PF on earned wages, ESI eligibility fixed per
 * contribution period, Professional Tax slabs by state. Pure functions: no
 * database, no HTTP.
 */
import { describe, it, expect } from 'vitest';
import { env } from '../config/env.js';
import { resolvePtStateCode } from '../config/professional-tax.js';
import {
  esiEligibility,
  esiEmployee,
  esiEmployer,
  esiPeriodKey,
  pfEmployee,
  pfEmployer,
  professionalTax,
} from './statutory.js';

describe('configuration defaults', () => {
  it('ships the statutory rates and ceilings as env defaults', () => {
    expect(env.PF_WAGE_CEILING).toBe(15000);
    expect(env.PF_RATE_PERCENT).toBe(12);
    expect(env.ESI_WAGE_CEILING).toBe(21000);
    expect(env.ESI_EMPLOYEE_PERCENT).toBe(0.75);
    expect(env.ESI_EMPLOYER_PERCENT).toBe(3.25);
  });
});

describe('PF', () => {
  it('caps the wage at the ceiling: 19,434 earned → 1,800', () => {
    expect(pfEmployee(19434)).toBe(1800);
    expect(pfEmployer(19434)).toBe(1800);
  });

  it('is 12% of what was earned below the ceiling: 12,000 → 1,440', () => {
    expect(pfEmployee(12000)).toBe(1440);
    expect(pfEmployer(12000)).toBe(1440);
  });

  it('follows the earned wage, not the full-month one (a pro-rated 6,774.19 → 812.90)', () => {
    expect(pfEmployee(6774.19)).toBe(812.9);
    expect(pfEmployer(6774.19)).toBe(812.9);
  });

  it('is nothing for no wage', () => {
    expect(pfEmployee(0)).toBe(0);
    expect(pfEmployer(0)).toBe(0);
    expect(pfEmployee(-500)).toBe(0);
  });

  it('honours a custom ceiling and rate', () => {
    const cfg = { ...env, PF_WAGE_CEILING: 20000, PF_RATE_PERCENT: 10 };
    expect(pfEmployee(19434, cfg)).toBe(1943.4);
    expect(pfEmployee(30000, cfg)).toBe(2000);
    expect(pfEmployer(30000, cfg)).toBe(2000);
  });
});

describe('esiPeriodKey', () => {
  it.each([
    ['2026-10-05', '2026-H2'],
    ['2027-02-01', '2026-H2'], // Jan–Mar belong to the period that began the previous October
    ['2026-05-01', '2026-H1'],
    ['2026-04-01', '2026-H1'],
    ['2026-09-30', '2026-H1'],
    ['2026-10-01', '2026-H2'],
    ['2026-12-31', '2026-H2'],
    ['2027-01-01', '2026-H2'],
    ['2027-03-31', '2026-H2'],
    ['2027-04-01', '2027-H1'],
  ])('%s → %s', (day, key) => {
    expect(esiPeriodKey(new Date(day))).toBe(key);
  });
});

describe('esiEligibility', () => {
  it('decides on the full-month gross when the period has not been decided yet, and asks the caller to save it', () => {
    expect(esiEligibility({}, 20500, '2026-H2', env)).toEqual({ eligible: true, persist: true });
    expect(esiEligibility({ statutory: {} }, 20500, '2026-H2', env)).toEqual({ eligible: true, persist: true });
  });

  it('treats the ceiling as inclusive: 21,000 is in, 21,000.01 is out', () => {
    expect(esiEligibility({}, 21000, '2026-H2', env).eligible).toBe(true);
    expect(esiEligibility({}, 21000.01, '2026-H2', env)).toEqual({ eligible: false, persist: true });
  });

  it('keeps an employee eligible for the rest of the period when the gross rises to 30,000', () => {
    const employee = { statutory: { esiEligible: true, esiPeriodKey: '2026-H2' } };
    expect(esiEligibility(employee, 30000, '2026-H2', env)).toEqual({ eligible: true, persist: false });
  });

  it('keeps an employee ineligible for the rest of the period when the gross falls to 15,000', () => {
    const employee = { statutory: { esiEligible: false, esiPeriodKey: '2026-H2' } };
    expect(esiEligibility(employee, 15000, '2026-H2', env)).toEqual({ eligible: false, persist: false });
  });

  it('decides again when a new period starts', () => {
    const employee = { statutory: { esiEligible: true, esiPeriodKey: '2026-H2' } };
    expect(esiEligibility(employee, 30000, '2027-H1', env)).toEqual({ eligible: false, persist: true });
    expect(esiEligibility({ statutory: { esiEligible: false, esiPeriodKey: '2026-H2' } }, 15000, '2027-H1', env)).toEqual({
      eligible: true,
      persist: true,
    });
  });

  it('decides again when the stored period has no decision in it', () => {
    expect(esiEligibility({ statutory: { esiPeriodKey: '2026-H2' } }, 18000, '2026-H2', env)).toEqual({
      eligible: true,
      persist: true,
    });
  });

  it('honours a custom ceiling', () => {
    expect(esiEligibility({}, 25000, '2026-H2', { ...env, ESI_WAGE_CEILING: 25000 }).eligible).toBe(true);
    expect(esiEligibility({}, 25001, '2026-H2', { ...env, ESI_WAGE_CEILING: 25000 }).eligible).toBe(false);
  });
});

describe('ESI contributions', () => {
  it('employee share rounds UP to the rupee: 20,500 × 0.75% = 153.75 → 154', () => {
    expect(esiEmployee(20500, true)).toBe(154);
  });

  it('employee share does not round an exact rupee up: 20,000 × 0.75% = 150', () => {
    expect(esiEmployee(20000, true)).toBe(150);
    expect(esiEmployee(2000, true)).toBe(15);
  });

  it('employee share rounds any fraction up: 13,333.33 → 99.99975 → 100, 20,000.01 → 150.000075 → 151', () => {
    expect(esiEmployee(13333.33, true)).toBe(100);
    expect(esiEmployee(20000.01, true)).toBe(151);
  });

  it('employer share is 3.25% to the paisa: 20,500 → 666.25', () => {
    expect(esiEmployer(20500, true)).toBe(666.25);
    expect(esiEmployer(13333.33, true)).toBe(433.33);
  });

  it('both are 0 when the employee is not eligible, or earned nothing', () => {
    expect(esiEmployee(20500, false)).toBe(0);
    expect(esiEmployer(20500, false)).toBe(0);
    expect(esiEmployee(0, true)).toBe(0);
    expect(esiEmployer(0, true)).toBe(0);
  });

  it('is on what was earned: a pro-rated 10,000 → 75 and 325', () => {
    expect(esiEmployee(10000, true)).toBe(75);
    expect(esiEmployer(10000, true)).toBe(325);
  });

  it('honours custom percentages', () => {
    const cfg = { ...env, ESI_EMPLOYEE_PERCENT: 1, ESI_EMPLOYER_PERCENT: 4 };
    expect(esiEmployee(20550, true, cfg)).toBe(206); // 205.50 up
    expect(esiEmployee(20500, true, cfg)).toBe(205);
    expect(esiEmployer(20500, true, cfg)).toBe(820);
  });
});

describe('professionalTax — Maharashtra', () => {
  const mh = (monthlyGross: number, month: number, gender?: 'male' | 'female' | 'other'): number =>
    professionalTax({ stateCode: 'MH', monthlyGross, month, gender });

  it('February is 300 for a man earning 30,000', () => {
    expect(mh(30000, 2, 'male')).toBe(300);
  });

  it('is 200 in any other month, for a woman above 25,000 too', () => {
    expect(mh(30000, 5, 'female')).toBe(200);
    expect(mh(30000, 5, 'male')).toBe(200);
  });

  it('a woman earning 25,000 or less pays nothing', () => {
    expect(mh(20000, 5, 'female')).toBe(0);
    expect(mh(25000, 2, 'female')).toBe(0);
    expect(mh(25001, 2, 'female')).toBe(300);
  });

  it('only a woman is exempt: "other" and unknown gender pay the slab', () => {
    expect(mh(20000, 5, 'other')).toBe(200);
    expect(mh(20000, 5)).toBe(200);
  });

  it('slabs: ≤7,500 nil; 7,501–10,000 is 175; above that 200', () => {
    expect(mh(7500, 5, 'male')).toBe(0);
    expect(mh(7501, 5, 'male')).toBe(175);
    expect(mh(10000, 5, 'male')).toBe(175);
    expect(mh(10001, 5, 'male')).toBe(200);
  });

  it('February is 300 only above 10,000 — the 175 slab does not change', () => {
    expect(mh(9000, 2, 'male')).toBe(175);
    expect(mh(10001, 2, 'male')).toBe(300);
  });
});

describe('professionalTax — other states', () => {
  const pt = (stateCode: string | undefined, monthlyGross: number, month = 5): number =>
    professionalTax({ stateCode, monthlyGross, month, gender: 'male' });

  it('Gujarat: ≤12,000 nil, above 200', () => {
    expect(pt('GJ', 11000)).toBe(0);
    expect(pt('GJ', 12000)).toBe(0);
    expect(pt('GJ', 12001)).toBe(200);
    expect(pt('GJ', 20000)).toBe(200);
  });

  it('Karnataka: below 25,000 nil, from 25,000 200', () => {
    expect(pt('KA', 24999)).toBe(0);
    expect(pt('KA', 24999.99)).toBe(0);
    expect(pt('KA', 25000)).toBe(200);
  });

  it('Tamil Nadu: half-yearly slabs expressed monthly', () => {
    expect(pt('TN', 3500)).toBe(0);
    expect(pt('TN', 3501)).toBe(22.5);
    expect(pt('TN', 5000)).toBe(22.5);
    expect(pt('TN', 5001)).toBe(52.5);
    expect(pt('TN', 7500)).toBe(52.5);
    expect(pt('TN', 7501)).toBe(115);
    expect(pt('TN', 10000)).toBe(115);
    expect(pt('TN', 10001)).toBe(171);
    expect(pt('TN', 12500)).toBe(171);
    expect(pt('TN', 12501)).toBe(208);
  });

  it('West Bengal', () => {
    expect(pt('WB', 10000)).toBe(0);
    expect(pt('WB', 10001)).toBe(110);
    expect(pt('WB', 15000)).toBe(110);
    expect(pt('WB', 15001)).toBe(130);
    expect(pt('WB', 25000)).toBe(130);
    expect(pt('WB', 25001)).toBe(150);
    expect(pt('WB', 40000)).toBe(150);
    expect(pt('WB', 40001)).toBe(200);
  });

  it('Andhra Pradesh and Telangana share a table', () => {
    for (const code of ['AP', 'TS']) {
      expect(pt(code, 15000)).toBe(0);
      expect(pt(code, 15001)).toBe(150);
      expect(pt(code, 20000)).toBe(150);
      expect(pt(code, 20001)).toBe(200);
    }
  });

  it('an unknown or missing state pays nothing', () => {
    expect(pt('XX', 50000)).toBe(0);
    expect(pt(undefined, 50000)).toBe(0);
    expect(pt('', 50000)).toBe(0);
  });

  it('reads the state code case-insensitively and ignores padding', () => {
    expect(pt('gj', 20000)).toBe(200);
    expect(pt(' Gj ', 20000)).toBe(200);
  });

  it('is nothing for no (or a negative) wage', () => {
    expect(pt('MH', 0)).toBe(0);
    expect(pt('GJ', -100)).toBe(0);
  });
});

describe('resolvePtStateCode', () => {
  it.each([
    ['Maharashtra', 'MH'],
    ['Gujarat', 'GJ'],
    ['Karnataka', 'KA'],
    ['Tamil Nadu', 'TN'],
    ['West Bengal', 'WB'],
    ['Andhra Pradesh', 'AP'],
    ['Telangana', 'TS'],
  ])('%s → %s', (name, code) => {
    expect(resolvePtStateCode(name)).toBe(code);
  });

  it('is case-insensitive and ignores padding and doubled spaces', () => {
    expect(resolvePtStateCode('maharashtra')).toBe('MH');
    expect(resolvePtStateCode('  GUJARAT ')).toBe('GJ');
    expect(resolvePtStateCode('tamil   nadu')).toBe('TN');
    expect(resolvePtStateCode('WEST BENGAL')).toBe('WB');
  });

  it('lets a code through, in any case', () => {
    expect(resolvePtStateCode('MH')).toBe('MH');
    expect(resolvePtStateCode('gj')).toBe('GJ');
    expect(resolvePtStateCode('TS')).toBe('TS');
    expect(resolvePtStateCode('TG')).toBe('TS'); // Telangana's ISO code
  });

  it('knows nothing of other places', () => {
    expect(resolvePtStateCode('Delhi')).toBeUndefined();
    expect(resolvePtStateCode('Mumbai')).toBeUndefined(); // a city is not a state
    expect(resolvePtStateCode('')).toBeUndefined();
    expect(resolvePtStateCode('   ')).toBeUndefined();
    expect(resolvePtStateCode(undefined)).toBeUndefined();
    expect(resolvePtStateCode(null)).toBeUndefined();
  });
});
