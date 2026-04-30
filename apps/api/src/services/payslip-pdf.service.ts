/**
 * Payslip PDF generator using PDFKit.
 *
 * Modern single-page A4 layout:
 *   1. Brand-colour header band (company name, month, payslip no)
 *   2. Employee info card (name, code, department, designation, joining)
 *   3. Attendance strip (6 horizontal stat tiles)
 *   4. Two-column body (Earnings | Deductions) with subtotals
 *   5. Net Pay banner (brand colour, amount + amount-in-words)
 *   6. Employer contributions + CTC summary
 *   7. Bank details + signature/footer
 */
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { logger } from '../config/logger.js';
import { saveFile } from '../lib/local-storage.js';
import type { IPayrollRecord } from '../models/payroll-record.model.js';
import type { IPayrollCycle } from '../models/payroll-cycle.model.js';
import type { IEmployee } from '../models/employee.model.js';

/**
 * Look for a company logo in `apps/api/branding/`. Resolved on every render
 * so dropping the file in (or replacing it) takes effect immediately — no
 * restart required.
 */
function resolveLogoPath(): string | null {
  const root = path.resolve(process.cwd(), 'branding');
  for (const name of ['company-logo.png', 'company-logo.jpg', 'company-logo.jpeg']) {
    const p = path.join(root, name);
    if (existsSync(p)) return p;
  }
  return null;
}

interface CompanyInfo {
  name: string;
  slug?: string;
  email?: string;
  address?: { line1?: string; city?: string; state?: string; zip?: string };
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface YtdTotals {
  earnings: number;
  deductions: number;
  net: number;
}

// Brand palette — derived from index.css (--primary: 220 57.3% 17.45%)
const COLOR = {
  brand: '#132446',
  brandSoft: '#e8edf6',
  text: '#0f172a',
  muted: '#64748b',
  divider: '#e2e8f0',
  positive: '#15803d',
  negative: '#b91c1c',
  cardBg: '#f8fafc',
  white: '#ffffff',
};

function inr(amount: number): string {
  // PDFKit's bundled Helvetica does not include the ₹ glyph (renders as ¹).
  // "Rs." is universally readable on every PDF viewer.
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Convert a number to Indian-style English words (whole rupees). */
function numberToIndianWords(n: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ];
  function below100(num: number): string {
    if (num < 20) return ones[num];
    return `${tens[Math.floor(num / 10)]}${num % 10 ? ' ' + ones[num % 10] : ''}`;
  }
  function below1000(num: number): string {
    if (num < 100) return below100(num);
    return `${ones[Math.floor(num / 100)]} Hundred${
      num % 100 ? ' ' + below100(num % 100) : ''
    }`;
  }
  const num = Math.floor(Math.abs(n));
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 1_00_00_000);
  const lakh = Math.floor((num % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((num % 1_00_000) / 1_000);
  const hundred = num % 1_000;
  const parts: string[] = [];
  if (crore) parts.push(`${below100(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (hundred) parts.push(below1000(hundred));
  return parts.join(' ');
}

function formatDateDDMMYYYY(d?: Date | string | null): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mmm = SHORT_MONTHS[date.getMonth()];
  const yy = String(date.getFullYear());
  return `${dd} ${mmm} ${yy}`;
}

function maskAccount(num?: string): string {
  if (!num) return '—';
  if (num.length <= 4) return num;
  return `XXXX${num.slice(-4)}`;
}

async function renderToBuffer(
  record: IPayrollRecord,
  cycle: IPayrollCycle,
  employee: IEmployee,
  tenant: CompanyInfo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ytd: YtdTotals,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width; // 595
    const pageH = doc.page.height; // 842
    const PAD = 40;
    const contentW = pageW - PAD * 2;

    /* ────────────────────────────────────────────────────────
       1. HEADER BAND
       ──────────────────────────────────────────────────────── */
    const headerH = 96;
    doc.rect(0, 0, pageW, headerH).fill(COLOR.brand);

    // Logo if present (left side), otherwise company name big.
    const logoPath = resolveLogoPath();
    if (logoPath) {
      try {
        // Fit the logo into a 220 × 56 box at the left.
        doc.image(logoPath, PAD, 24, {
          fit: [220, 56],
          valign: 'center',
        });
      } catch (err) {
        logger.warn({ err, path: logoPath }, 'Failed to embed logo, falling back to text');
        doc
          .fillColor(COLOR.white)
          .font('Helvetica-Bold')
          .fontSize(22)
          .text(tenant.name, PAD, 30, { width: contentW - 200, align: 'left' });
      }
    } else {
      // Pick a font size that fits the company name on a single line within
      // the left half of the header (so the right-side PAYSLIP block stays clean).
      const nameMaxW = contentW - 200;
      let nameSize = 22;
      doc.font('Helvetica-Bold').fontSize(nameSize);
      while (nameSize > 14 && doc.widthOfString(tenant.name) > nameMaxW) {
        nameSize -= 1;
        doc.fontSize(nameSize);
      }
      doc.fillColor(COLOR.white).text(tenant.name, PAD, 32, {
        width: nameMaxW,
        align: 'left',
        lineBreak: false,
      });
      if (tenant.email) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(COLOR.brandSoft)
          .text(tenant.email, PAD, 32 + nameSize + 6, { width: nameMaxW });
      }
    }

    // Right-aligned PAYSLIP block
    const monthLabel = `${FULL_MONTHS[cycle.month - 1]} ${cycle.year}`;
    doc.fillColor(COLOR.white).font('Helvetica-Bold').fontSize(11);
    doc.text('PAYSLIP', PAD, 36, { width: contentW, align: 'right' });
    doc.font('Helvetica').fontSize(13);
    doc.text(monthLabel, PAD, 54, { width: contentW, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.brandSoft);
    doc.text(`Slip #${employee.employeeId}`, PAD, 74, {
      width: contentW,
      align: 'right',
    });

    /* ────────────────────────────────────────────────────────
       2. EMPLOYEE CARD
       ──────────────────────────────────────────────────────── */
    let y = headerH + 24;
    const cardH = 110;
    doc
      .roundedRect(PAD, y, contentW, cardH, 6)
      .fillAndStroke(COLOR.cardBg, COLOR.divider);

    const leftColX = PAD + 18;
    const rightColX = PAD + contentW / 2 + 6;

    const fullName = `${employee.firstName} ${employee.lastName}`.trim();
    const dept =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((employee.department as any)?.name as string | undefined) ?? '—';
    const designation =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((employee.designation as any)?.name as string | undefined) ?? '—';

    // Name (bigger) + email
    doc
      .fillColor(COLOR.text)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(fullName, leftColX, y + 14);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLOR.muted)
      .text(employee.email ?? '', leftColX, y + 36);

    // Two-column key/value grid
    const fieldGap = 18;
    const gridY = y + 54;
    const drawField = (label: string, value: string, x: number, yy: number, w = 200): void => {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, yy, {
        characterSpacing: 0.7,
        width: w,
      });
      doc
        .fillColor(COLOR.text)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(value, x, yy + 10, { width: w });
    };
    drawField('Employee Code', employee.employeeId ?? '—', leftColX, gridY);
    drawField('Department', dept, leftColX, gridY + 24);
    // Right column starts at the same baseline as the left column's grid
    // so the four fields form an aligned 2x2 grid.
    drawField('Designation', designation, rightColX, gridY);
    drawField(
      'Date of Joining',
      formatDateDDMMYYYY(employee.joiningDate),
      rightColX,
      gridY + 24,
    );
    // Move "Pay Period" to a small tag at the top-right so the grid
    // stays clean.
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(
      'PAY PERIOD',
      rightColX,
      y + 14,
      { characterSpacing: 0.7 },
    );
    doc
      .fillColor(COLOR.brand)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(monthLabel, rightColX, y + 26);
    void fieldGap;

    y += cardH + 16;

    /* ────────────────────────────────────────────────────────
       3. ATTENDANCE STRIP — 6 stat tiles
       ──────────────────────────────────────────────────────── */
    const tiles: { label: string; value: string }[] = [
      { label: 'Days Paid', value: (record.daysPaid ?? 0).toFixed(0) },
      { label: 'Present', value: (record.presentDays ?? 0).toFixed(0) },
      { label: 'Week Off', value: (record.weeklyOffDays ?? 0).toFixed(0) },
      { label: 'Paid Leave', value: (record.paidLeaveDays ?? 0).toFixed(0) },
      { label: 'Unpaid', value: (record.unpaidDays ?? 0).toFixed(0) },
      { label: 'Late Logins', value: (record.lateLoginCount ?? 0).toFixed(0) },
    ];
    const tileGap = 6;
    const tileW = (contentW - tileGap * (tiles.length - 1)) / tiles.length;
    const tileH = 50;
    tiles.forEach((t, i) => {
      const x = PAD + i * (tileW + tileGap);
      doc
        .roundedRect(x, y, tileW, tileH, 4)
        .fillAndStroke(COLOR.white, COLOR.divider);
      doc
        .fillColor(COLOR.muted)
        .font('Helvetica')
        .fontSize(7.5)
        .text(t.label.toUpperCase(), x + 6, y + 7, {
          width: tileW - 12,
          align: 'center',
          characterSpacing: 0.6,
        });
      doc
        .fillColor(COLOR.brand)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(t.value, x, y + 22, { width: tileW, align: 'center' });
    });
    y += tileH + 24;

    /* ────────────────────────────────────────────────────────
       4. EARNINGS | DEDUCTIONS — two columns
       ──────────────────────────────────────────────────────── */
    const colGap = 16;
    const colW = (contentW - colGap) / 2;
    const colXEarn = PAD;
    const colXDed = PAD + colW + colGap;

    // Section headers
    const sectionH = 26;
    const drawSectionHeader = (text: string, x: number, color: string): void => {
      doc.rect(x, y, colW, sectionH).fill(color);
      doc
        .fillColor(COLOR.white)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(text, x + 12, y + 8, { width: colW - 24, characterSpacing: 0.6 });
    };
    drawSectionHeader('EARNINGS', colXEarn, COLOR.positive);
    drawSectionHeader('DEDUCTIONS', colXDed, COLOR.negative);

    let earnY = y + sectionH;
    let dedY = y + sectionH;

    // Body cards (start drawing rows)
    const rowH = 22;
    const drawRow = (
      x: number,
      yy: number,
      label: string,
      amount: number,
      isTotal = false,
    ): void => {
      if (isTotal) {
        doc.rect(x, yy, colW, rowH).fill(COLOR.cardBg);
      }
      doc
        .fillColor(isTotal ? COLOR.text : COLOR.text)
        .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .text(label, x + 12, yy + 7, { width: colW - 100 });
      doc
        .fillColor(isTotal ? COLOR.brand : COLOR.text)
        .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .text(inr(amount), x + colW - 100, yy + 7, { width: 88, align: 'right' });

      doc
        .moveTo(x, yy + rowH)
        .lineTo(x + colW, yy + rowH)
        .strokeColor(COLOR.divider)
        .lineWidth(0.5)
        .stroke();
    };

    // Earnings rows
    record.earnings.forEach((line) => {
      drawRow(colXEarn, earnY, line.name, line.amount, false);
      earnY += rowH;
    });
    drawRow(colXEarn, earnY, 'Gross Earnings', record.grossSalary, true);
    earnY += rowH;

    // Deductions rows
    record.deductions.forEach((line) => {
      drawRow(colXDed, dedY, line.name, line.amount, false);
      dedY += rowH;
    });
    if (record.deductions.length === 0) {
      doc
        .fillColor(COLOR.muted)
        .font('Helvetica-Oblique')
        .fontSize(9)
        .text('No deductions', colXDed + 12, dedY + 7, { width: colW - 24 });
      dedY += rowH;
    }
    drawRow(colXDed, dedY, 'Total Deductions', record.totalDeductions, true);
    dedY += rowH;

    // Outline boxes around both columns
    const colBottom = Math.max(earnY, dedY);
    doc
      .roundedRect(colXEarn, y, colW, colBottom - y, 4)
      .strokeColor(COLOR.divider)
      .lineWidth(0.5)
      .stroke();
    doc
      .roundedRect(colXDed, y, colW, colBottom - y, 4)
      .strokeColor(COLOR.divider)
      .lineWidth(0.5)
      .stroke();

    y = colBottom + 18;

    /* ────────────────────────────────────────────────────────
       5. NET PAY BANNER
       ──────────────────────────────────────────────────────── */
    const netH = 64;
    doc.roundedRect(PAD, y, contentW, netH, 8).fill(COLOR.brand);

    doc
      .fillColor(COLOR.brandSoft)
      .font('Helvetica')
      .fontSize(9)
      .text('NET PAY', PAD + 24, y + 12, { characterSpacing: 1 });

    doc
      .fillColor(COLOR.white)
      .font('Helvetica-Bold')
      .fontSize(26)
      .text(inr(record.netSalary), PAD + 24, y + 24);

    // Right side: amount in words
    doc
      .fillColor(COLOR.brandSoft)
      .font('Helvetica')
      .fontSize(8)
      .text('IN WORDS', PAD + contentW - 220 - 24, y + 12, {
        width: 220,
        align: 'right',
        characterSpacing: 1,
      });
    doc
      .fillColor(COLOR.white)
      .font('Helvetica-Oblique')
      .fontSize(9.5)
      .text(`${numberToIndianWords(record.netSalary)} Only`, PAD + contentW - 320, y + 28, {
        width: 296,
        align: 'right',
      });
    y += netH + 18;

    /* ────────────────────────────────────────────────────────
       6. EMPLOYER CONTRIBUTIONS + CTC
       ──────────────────────────────────────────────────────── */
    if (record.employerContributions?.length) {
      const ctc =
        record.grossSalary +
        record.employerContributions.reduce((s, c) => s + (c.amount || 0), 0);

      const empH = 70;
      doc
        .roundedRect(PAD, y, contentW, empH, 6)
        .fillAndStroke(COLOR.cardBg, COLOR.divider);

      doc
        .fillColor(COLOR.muted)
        .font('Helvetica')
        .fontSize(7.5)
        .text('EMPLOYER CONTRIBUTIONS', PAD + 18, y + 12, {
          characterSpacing: 0.7,
        });

      let cx = PAD + 18;
      const cy = y + 28;
      record.employerContributions.forEach((c, idx) => {
        if (idx > 0) cx += 140;
        doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text(c.name, cx, cy);
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(COLOR.text)
          .text(inr(c.amount), cx, cy + 12);
      });

      // CTC on the right
      doc
        .fillColor(COLOR.muted)
        .font('Helvetica')
        .fontSize(7.5)
        .text('TOTAL CTC (this month)', PAD + contentW - 200, y + 12, {
          width: 182,
          align: 'right',
          characterSpacing: 0.7,
        });
      doc
        .fillColor(COLOR.brand)
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(inr(ctc), PAD + contentW - 200, y + 28, { width: 182, align: 'right' });

      y += empH + 16;
    }

    /* ────────────────────────────────────────────────────────
       7. BANK DETAILS
       ──────────────────────────────────────────────────────── */
    if (record.bankDetails?.accountNumber) {
      const bnkH = 56;
      doc
        .roundedRect(PAD, y, contentW, bnkH, 6)
        .fillAndStroke(COLOR.white, COLOR.divider);

      doc
        .fillColor(COLOR.muted)
        .font('Helvetica')
        .fontSize(7.5)
        .text('PAYMENT DETAILS', PAD + 18, y + 10, { characterSpacing: 0.7 });

      const drawBankField = (label: string, value: string, x: number, w: number): void => {
        doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8).text(label, x, y + 24);
        doc
          .fillColor(COLOR.text)
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(value, x, y + 36, { width: w });
      };
      drawBankField(
        'Bank',
        record.bankDetails.bankName ?? '—',
        PAD + 18,
        160,
      );
      drawBankField(
        'Account No.',
        maskAccount(record.bankDetails.accountNumber),
        PAD + 18 + 180,
        140,
      );
      drawBankField(
        'IFSC',
        record.bankDetails.ifscCode ?? '—',
        PAD + 18 + 340,
        120,
      );
      y += bnkH + 14;
    }

    /* ────────────────────────────────────────────────────────
       8. FOOTER
       ──────────────────────────────────────────────────────── */
    doc
      .moveTo(PAD, pageH - 56)
      .lineTo(pageW - PAD, pageH - 56)
      .strokeColor(COLOR.divider)
      .lineWidth(0.5)
      .stroke();
    doc
      .fillColor(COLOR.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(
        'This is a computer-generated payslip and does not require a signature or stamp.',
        PAD,
        pageH - 44,
        { width: contentW, align: 'center' },
      );
    doc
      .fillColor(COLOR.muted)
      .font('Helvetica-Oblique')
      .fontSize(7.5)
      .text(
        `Generated on ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
        PAD,
        pageH - 28,
        { width: contentW, align: 'center' },
      );

    doc.end();
  });
}

export async function generatePayslipPdf(
  record: IPayrollRecord,
  cycle: IPayrollCycle,
  employee: IEmployee,
  tenant: CompanyInfo,
  ytd: YtdTotals,
): Promise<string> {
  const buffer = await renderToBuffer(record, cycle, employee, tenant, ytd);
  const key = `payslips/${cycle.year}-${String(cycle.month).padStart(2, '0')}/${employee.employeeId}.pdf`;

  try {
    return await saveFile(key, buffer, 'application/pdf');
  } catch (err) {
    logger.error({ err, key }, 'Failed to save payslip PDF');
    throw err;
  }
}
