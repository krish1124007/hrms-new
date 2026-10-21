/**
 * Reading an employee spreadsheet for `POST /employees/import`: which columns
 * are understood, how a row becomes an API row, and why a row is skipped — so
 * the import dialog can document every column it accepts and list every row
 * it leaves out instead of dropping it silently.
 */

export interface ImportColumn {
  /** Header used in the template; matching is case-insensitive and lenient. */
  header: string;
  required?: boolean;
  note?: string;
  /** Header variants that map to this column. */
  match: RegExp;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'First Name', required: true, match: /first.*name|^fname$/i },
  { header: 'Last Name', required: true, match: /last.*name|^lname$/i },
  {
    header: 'Email',
    required: true,
    note: 'login e-mail; an existing employee with this e-mail is updated',
    match: /employee.*mail|mail.*id|email|^mail$/i,
  },
  {
    header: 'Joining Date',
    required: true,
    note: 'YYYY-MM-DD or DD/MM/YYYY',
    match: /joining.*date|join.*date|^date.*joined$/i,
  },
  { header: 'Employee ID', note: 'kept when given', match: /^employee\s*id$|^emp\s*id$|^employee\s*code$/i },
  { header: 'Phone', match: /^phone|mobile|^contact(\s*no|\s*number)?$/i },
  { header: 'Date of Birth', note: 'YYYY-MM-DD or DD/MM/YYYY', match: /date.*of.*birth|^dob$/i },
  { header: 'Gender', note: 'male / female / other', match: /^gender$/i },
  { header: 'Department', note: 'by name; created if new', match: /^department$/i },
  { header: 'Designation', note: 'by name; created if new', match: /^designation$/i },
  {
    header: 'Employment Type',
    note: 'full-time / part-time / contract / intern',
    match: /employment.*type/i,
  },
  { header: 'Work Location', match: /work.*location/i },
  {
    header: 'Status',
    note: 'active / onNotice / inactive / resigned / terminated',
    match: /^status$/i,
  },
  {
    header: 'Exit Date',
    note: 'needed with inactive / resigned / terminated',
    match: /exit.*date|last.*working.*day|relieving.*date/i,
  },
  { header: 'Bank Name', match: /bank.*name/i },
  { header: 'Account Number', match: /account.*number|^a\/c.*no/i },
  { header: 'IFSC', match: /ifsc/i },
  { header: 'Emergency Contact Name', match: /emergency.*contact.*name/i },
  { header: 'Emergency Contact Phone', match: /emergency.*contact.*phone|emergency.*phone/i },
];

/** What `POST /employees/import` takes for one row. */
export interface ImportPayloadRow {
  firstName: string;
  lastName: string;
  email: string;
  joiningDate: string;
  employeeId?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  departmentName?: string;
  designationName?: string;
  employmentType?: string;
  workLocation?: string;
  status?: string;
  exitDate?: string;
  bankDetails?: { bankName?: string; accountNumber?: string; ifscCode?: string };
  emergencyContact?: { name?: string; phone?: string };
}

export interface ReadyRow {
  /** Row number in the spreadsheet (the header is row 1). */
  sheetRow: number;
  payload: ImportPayloadRow;
}

export interface SkippedRow {
  sheetRow: number;
  email?: string;
  reason: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const isBlank = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === '';

function validKey(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * A spreadsheet date cell as `YYYY-MM-DD`, or `null` when it cannot be read.
 * Excel serial numbers, `YYYY-MM-DD` and the Indian `DD/MM/YYYY` (also with
 * `-` or `.`) are understood. Never goes through a browser-local `Date`, so
 * the day cannot shift with the timezone.
 */
export function parseImportDate(raw: unknown): string | null {
  if (isBlank(raw)) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel's day 0 is 1899-12-30; the serial counts whole days from there.
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const text = String(raw).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (m) return validKey(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return validKey(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sheet rows (as `sheet_to_json` gives them, header row excluded) → the rows
 * to import and the rows left out, each with its spreadsheet row number and
 * the reason. Completely empty rows are ignored.
 */
export function parseEmployeeSheet(rows: Record<string, unknown>[]): {
  ready: ReadyRow[];
  skipped: SkippedRow[];
} {
  const ready: ReadyRow[] = [];
  const skipped: SkippedRow[] = [];

  rows.forEach((row, index) => {
    const sheetRow = index + 2;
    const keys = Object.keys(row);
    if (keys.every((k) => isBlank(row[k]))) return;

    const cell = (header: string): unknown => {
      const col = IMPORT_COLUMNS.find((c) => c.header === header);
      const key = col ? keys.find((k) => col.match.test(k.trim())) : undefined;
      return key === undefined ? '' : row[key];
    };
    const text = (header: string): string => String(cell(header) ?? '').trim();

    const firstName = text('First Name');
    const lastName = text('Last Name');
    const email = text('Email');
    const joiningRaw = cell('Joining Date');
    const joiningDate = parseImportDate(joiningRaw);

    const problems: string[] = [];
    const missing = [
      !firstName && 'First Name',
      !lastName && 'Last Name',
      !email && 'Email',
      isBlank(joiningRaw) && 'Joining Date',
    ].filter(Boolean);
    if (missing.length) problems.push(`missing ${missing.join(', ')}`);
    if (email && !EMAIL.test(email)) problems.push(`"${email}" is not an e-mail address`);
    if (!isBlank(joiningRaw) && !joiningDate) {
      problems.push(`unreadable Joining Date "${String(joiningRaw)}" (use YYYY-MM-DD or DD/MM/YYYY)`);
    }
    const dobRaw = cell('Date of Birth');
    const dateOfBirth = parseImportDate(dobRaw);
    if (!isBlank(dobRaw) && !dateOfBirth) {
      problems.push(`unreadable Date of Birth "${String(dobRaw)}"`);
    }
    const exitRaw = cell('Exit Date');
    const exitDate = parseImportDate(exitRaw);
    if (!isBlank(exitRaw) && !exitDate) {
      problems.push(`unreadable Exit Date "${String(exitRaw)}"`);
    }

    if (problems.length || !joiningDate) {
      skipped.push({ sheetRow, ...(email ? { email } : {}), reason: problems.join('; ') });
      return;
    }

    const payload: ImportPayloadRow = { firstName, lastName, email, joiningDate };
    const optional: Array<[keyof ImportPayloadRow, string, ((v: string) => string)?]> = [
      ['employeeId', 'Employee ID'],
      ['phone', 'Phone'],
      ['gender', 'Gender', (v) => v.toLowerCase()],
      ['departmentName', 'Department'],
      ['designationName', 'Designation'],
      ['employmentType', 'Employment Type', (v) => v.toLowerCase()],
      ['workLocation', 'Work Location'],
      ['status', 'Status', (v) => v.toLowerCase()],
    ];
    for (const [field, header, transform] of optional) {
      const v = text(header);
      if (v) (payload as unknown as Record<string, string>)[field] = transform ? transform(v) : v;
    }
    if (dateOfBirth) payload.dateOfBirth = dateOfBirth;
    if (exitDate) payload.exitDate = exitDate;
    const bankName = text('Bank Name');
    const accountNumber = text('Account Number');
    const ifscCode = text('IFSC');
    if (bankName || accountNumber || ifscCode) {
      payload.bankDetails = {
        ...(bankName ? { bankName } : {}),
        ...(accountNumber ? { accountNumber } : {}),
        ...(ifscCode ? { ifscCode } : {}),
      };
    }
    const ecName = text('Emergency Contact Name');
    const ecPhone = text('Emergency Contact Phone');
    if (ecName || ecPhone) {
      payload.emergencyContact = { ...(ecName ? { name: ecName } : {}), ...(ecPhone ? { phone: ecPhone } : {}) };
    }
    ready.push({ sheetRow, payload });
  });

  return { ready, skipped };
}

/** The downloadable template: every accepted column, fictional people only. */
export function templateRows(): Record<string, string>[] {
  const blank = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.header, '']));
  return [
    {
      ...blank,
      'First Name': 'Asha',
      'Last Name': 'Example',
      Email: 'asha.example@example.com',
      'Joining Date': '2026-01-15',
      'Employee ID': 'EMP-9001',
      Phone: '9800000001',
      'Date of Birth': '1995-04-20',
      Gender: 'female',
      Department: 'Operations',
      Designation: 'Executive',
      'Employment Type': 'full-time',
      'Work Location': 'Head Office',
      Status: 'active',
    },
    {
      ...blank,
      'First Name': 'Ravi',
      'Last Name': 'Sample',
      Email: 'ravi.sample@example.com',
      'Joining Date': '01/02/2026',
      Phone: '9800000002',
      Department: 'Sales',
      'Employment Type': 'contract',
    },
  ];
}
