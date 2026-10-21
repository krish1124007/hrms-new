import { describe, expect, it } from 'vitest';
import { IMPORT_COLUMNS, parseEmployeeSheet, parseImportDate, templateRows } from './employee-import';

describe('parseImportDate', () => {
  it('reads ISO, Indian DD/MM/YYYY and Excel serial dates without a timezone shift', () => {
    expect(parseImportDate('2026-01-15')).toBe('2026-01-15');
    expect(parseImportDate('15/01/2026')).toBe('2026-01-15');
    expect(parseImportDate('5-1-2026')).toBe('2026-01-05');
    expect(parseImportDate(46037)).toBe('2026-01-15');
  });

  it('refuses what it cannot read', () => {
    expect(parseImportDate('31/02/2026')).toBeNull();
    expect(parseImportDate('next monday')).toBeNull();
    expect(parseImportDate('')).toBeNull();
  });
});

describe('parseEmployeeSheet', () => {
  it('reports every skipped row with its spreadsheet row number and reason', () => {
    const { ready, skipped } = parseEmployeeSheet([
      { 'First Name': 'Asha', 'Last Name': 'Rao', Email: 'asha@example.com', 'Joining Date': '2026-01-15' },
      { 'First Name': 'Ravi', 'Last Name': '', Email: 'ravi@example.com', 'Joining Date': '' },
      { 'First Name': '', 'Last Name': '', Email: '', 'Joining Date': '' },
      { 'First Name': 'Meera', 'Last Name': 'Shah', Email: 'meera@example.com', 'Joining Date': 'soon' },
    ]);

    expect(ready.map((r) => r.sheetRow)).toEqual([2]);
    // The blank row 4 is ignored, not reported.
    expect(skipped).toEqual([
      { sheetRow: 3, email: 'ravi@example.com', reason: 'missing Last Name, Joining Date' },
      {
        sheetRow: 5,
        email: 'meera@example.com',
        reason: 'unreadable Joining Date "soon" (use YYYY-MM-DD or DD/MM/YYYY)',
      },
    ]);
  });

  it('maps the optional columns the API accepts', () => {
    const { ready } = parseEmployeeSheet([
      {
        'First Name': 'Asha',
        'Last Name': 'Rao',
        'Employee Mail ID': 'asha@example.com',
        'Joining Date': '15/01/2026',
        'Employee ID': 'EMP-7',
        'Phone Number': '9800000001',
        Department: 'Sales',
        Designation: 'Executive',
        Status: 'Resigned',
        'Exit Date': '2026-09-30',
        'Bank Name': 'Example Bank',
        IFSC: 'EXMP0000001',
        'Emergency Contact Name': 'Ravi',
        'Emergency Contact Phone': '9800000002',
      },
    ]);
    expect(ready[0].payload).toEqual({
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.com',
      joiningDate: '2026-01-15',
      employeeId: 'EMP-7',
      phone: '9800000001',
      departmentName: 'Sales',
      designationName: 'Executive',
      status: 'resigned',
      exitDate: '2026-09-30',
      bankDetails: { bankName: 'Example Bank', ifscCode: 'EXMP0000001' },
      emergencyContact: { name: 'Ravi', phone: '9800000002' },
    });
  });
});

describe('templateRows', () => {
  it('has every documented column and only example.com addresses', () => {
    const rows = templateRows();
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(IMPORT_COLUMNS.map((c) => c.header));
      expect(row.Email).toMatch(/@example\.com$/);
    }
    // And the template parses cleanly.
    expect(parseEmployeeSheet(rows).skipped).toEqual([]);
  });
});
