/**
 * Amount in words (payslips, payment receipts) — Indian numbering, including
 * crore counts of 100 and more.
 */
import { describe, it, expect } from 'vitest';
import { numberToIndianWords } from './payslip-pdf.service.js';

describe('numberToIndianWords', () => {
  it('reads lakhs and crores the Indian way', () => {
    expect(numberToIndianWords(0)).toBe('Zero');
    expect(numberToIndianWords(1_05_250)).toBe('One Lakh Five Thousand Two Hundred Fifty');
    expect(numberToIndianWords(99_99_99_999)).toBe(
      'Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine',
    );
  });

  it('reads 100 crore and more (the crore count is itself a number in words)', () => {
    expect(numberToIndianWords(1_00_00_00_000)).toBe('One Hundred Crore');
    expect(numberToIndianWords(1_50_25_00_000)).toBe('One Hundred Fifty Crore Twenty Five Lakh');
    // 1,23,456 crore 78 lakh 90 thousand 123
    expect(numberToIndianWords(1_23_456_78_90_123)).toBe(
      'One Lakh Twenty Three Thousand Four Hundred Fifty Six Crore Seventy Eight Lakh Ninety Thousand One Hundred Twenty Three',
    );
  });
});
