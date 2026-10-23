import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { BUSINESS_TZ } from '../lib/business-day.js';
import { COLOR, resolveLogoPath } from './payslip-pdf.service.js';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/* ── Formatting ── */
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});
const timeFormat = new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});
/** `15 Oct 2026, 10:00` in IST ('' when absent). */
export function formatDateTime(at) {
    if (!at)
        return '';
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? '' : dateTimeFormat.format(d);
}
/** `10:00` in IST ('' when absent). */
export function formatTime(at) {
    if (!at)
        return '';
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? '' : timeFormat.format(d);
}
/** A file-name-safe piece: letters, digits, `-` and `_` only. */
export const safeFilePart = (s) => s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
/* ── Excel ── */
/** Excel sheet names: ≤ 31 characters, none of `[]:*?/\`. */
const sheetName = (name) => name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
export function workbookBuffer(file) {
    const wb = XLSX.utils.book_new();
    for (const table of file.tables) {
        const ws = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows.map((row) => row.map((c) => (c == null ? '' : c)))]);
        ws['!cols'] = table.columns.map((column, i) => ({
            wch: Math.min(60, Math.max(column.length, ...table.rows.map((row) => String(row[i] ?? '').length)) + 2),
        }));
        XLSX.utils.book_append_sheet(wb, ws, sheetName(table.name));
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
/* ── PDF ── */
const MARGIN = 36;
const HEADER_H = 64;
const CELL_PAD = 4;
const FONT_SIZE = 8;
/** Longest text a PDF cell shows (the workbook keeps it all). */
const CELL_MAX_CHARS = 500;
/** Helvetica has no ₹ (it would print as ¹): spell it out. */
const pdfText = (c) => {
    const text = c == null ? '' : String(c);
    const plain = text.replace(/₹/g, 'Rs ');
    return plain.length > CELL_MAX_CHARS ? `${plain.slice(0, CELL_MAX_CHARS - 1)}…` : plain;
};
function drawHeader(pdf, file) {
    const pageW = pdf.page.width;
    pdf.rect(0, 0, pageW, HEADER_H).fill(COLOR.brand);
    const company = env.COMPANY_NAME || 'Company';
    const logo = resolveLogoPath();
    let drewLogo = false;
    if (logo) {
        try {
            pdf.image(logo, MARGIN, 12, { fit: [160, 40], valign: 'center' });
            drewLogo = true;
        }
        catch (err) {
            logger.warn({ err, path: logo }, 'Field report: failed to embed the logo');
        }
    }
    if (!drewLogo) {
        pdf.fillColor(COLOR.white).font('Helvetica-Bold').fontSize(16).text(company, MARGIN, 22, { width: 300 });
    }
    pdf
        .fillColor(COLOR.white)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(file.title, pageW / 2, 16, { width: pageW / 2 - MARGIN, align: 'right' });
    if (file.subtitle) {
        pdf
            .font('Helvetica')
            .fontSize(9)
            .text(file.subtitle, pageW / 2, 36, { width: pageW / 2 - MARGIN, align: 'right' });
    }
    pdf.x = MARGIN;
    pdf.y = HEADER_H + 16;
}
function drawTable(pdf, table, withHeading) {
    const left = MARGIN;
    const width = pdf.page.width - MARGIN * 2;
    const bottom = pdf.page.height - MARGIN - 16;
    const rel = table.widths && table.widths.length === table.columns.length ? table.widths : table.columns.map(() => 1);
    const relSum = rel.reduce((s, w) => s + w, 0);
    const colW = rel.map((w) => (w / relSum) * width);
    if (withHeading) {
        if (pdf.y + 40 > bottom)
            pdf.addPage();
        pdf.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(11).text(table.name, left, pdf.y, { width });
        pdf.y += 4;
    }
    const drawRow = (cells, header) => {
        pdf.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT_SIZE);
        const h = Math.max(...cells.map((c, i) => pdf.heightOfString(c || ' ', { width: colW[i] - CELL_PAD * 2 })), FONT_SIZE) + CELL_PAD * 2;
        if (pdf.y + h > bottom) {
            pdf.addPage();
            pdf.y = MARGIN;
            if (!header)
                drawRow(table.columns, true);
        }
        const y = pdf.y;
        if (header)
            pdf.rect(left, y, width, h).fill(COLOR.brandSoft);
        let x = left;
        cells.forEach((c, i) => {
            pdf
                .fillColor(header ? COLOR.brand : COLOR.text)
                .font(header ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(FONT_SIZE)
                .text(c, x + CELL_PAD, y + CELL_PAD, { width: colW[i] - CELL_PAD * 2 });
            x += colW[i];
        });
        pdf.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(COLOR.divider).stroke();
        pdf.x = left;
        pdf.y = y + h;
    };
    drawRow(table.columns, true);
    if (table.rows.length === 0) {
        pdf.fillColor(COLOR.muted).font('Helvetica-Oblique').fontSize(FONT_SIZE).text('Nothing to show.', left + CELL_PAD, pdf.y + CELL_PAD);
        pdf.x = left;
        pdf.y += FONT_SIZE + CELL_PAD * 2;
    }
    for (const row of table.rows)
        drawRow(table.columns.map((_, i) => pdfText(row[i])), false);
    pdf.y += 16;
}
export function pdfBuffer(file) {
    return new Promise((resolve, reject) => {
        const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true });
        const chunks = [];
        pdf.on('data', (chunk) => chunks.push(chunk));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', reject);
        drawHeader(pdf, file);
        const several = file.tables.length > 1;
        for (const table of file.tables)
            drawTable(pdf, table, several);
        const range = pdf.bufferedPageRange();
        const generated = `Generated ${formatDateTime(new Date())} IST`;
        for (let i = range.start; i < range.start + range.count; i += 1) {
            pdf.switchToPage(i);
            // Writing inside the bottom margin would start a new page: lift it while the footer is drawn.
            const bottomMargin = pdf.page.margins.bottom;
            pdf.page.margins.bottom = 0;
            pdf
                .fillColor(COLOR.muted)
                .font('Helvetica')
                .fontSize(7)
                .text(`${generated}  ·  Page ${i + 1} of ${range.count}`, MARGIN, pdf.page.height - MARGIN + 8, {
                width: pdf.page.width - MARGIN * 2,
                align: 'right',
                lineBreak: false,
            });
            pdf.page.margins.bottom = bottomMargin;
        }
        pdf.end();
    });
}
/** Answer with the report as a download. */
export async function sendReportFile(res, format, file) {
    const body = format === 'xlsx' ? workbookBuffer(file) : await pdfBuffer(file);
    res.setHeader('Content-Type', format === 'xlsx' ? XLSX_MIME : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilePart(file.filename)}.${format}"`);
    res.setHeader('Content-Length', String(body.length));
    res.status(200).send(body);
}
//# sourceMappingURL=field-report-export.service.js.map