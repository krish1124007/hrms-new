import { describe, expect, it } from 'vitest';
import { normaliseHolidayDate, parseHolidayList } from './holiday-import';

describe('holiday import parsing', () => {
  it('reads ISO and Indian date formats and rejects impossible dates', () => {
    expect(normaliseHolidayDate('2027-01-26')).toBe('2027-01-26');
    expect(normaliseHolidayDate('15/08/2027')).toBe('2027-08-15');
    expect(normaliseHolidayDate('2-10-2027')).toBe('2027-10-02');
    expect(normaliseHolidayDate('2027-02-30')).toBeNull();
    expect(normaliseHolidayDate('next friday')).toBeNull();
  });

  it('parses a CSV with a header, optional types and names with commas', () => {
    const { rows, errors } = parseHolidayList(
      [
        'date,name,type',
        '2027-01-26, Republic Day, public',
        '"14/01/2027","Makar Sankranti",optional',
        '2027-11-08, Diwali, Lakshmi Puja',
        '',
        '2027-02-30, Bad day',
        '2027-03-01',
      ].join('\n'),
    );
    expect(rows).toEqual([
      { date: '2027-01-26', name: 'Republic Day', type: 'public' },
      { date: '2027-01-14', name: 'Makar Sankranti', type: 'optional' },
      { date: '2027-11-08', name: 'Diwali, Lakshmi Puja', type: 'public' },
    ]);
    expect(errors).toEqual([
      'Line 6: "2027-02-30" is not a date (use YYYY-MM-DD or DD/MM/YYYY)',
      'Line 7: expected "date, name"',
    ]);
  });
});
