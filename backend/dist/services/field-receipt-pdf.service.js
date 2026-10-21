/**
 * Payment receipt PDF for a field collection (GET /field/payments/:id/receipt).
 *
 * One A5-sized page rendered with the same PDFKit setup and palette as the
 * payslip: company header band, receipt number and IST date, who paid, the
 * amount in figures and in words, mode and reference, the order it was
 * allocated to, and who collected it. Rendered on demand, never stored.
 */
import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';
import { BUSINESS_TZ } from '../lib/business-day.js';
import { inr, numberToIndianWords } from './payslip-pdf.service.js';
const COLOR = {
    brand: '#132446',
    text: '#0f172a',
    muted: '#64748b',
    divider: '#e2e8f0',
    cardBg: '#f8fafc',
    white: '#ffffff',
};
const METHOD_LABELS = {
    cash: 'Cash',
    cheque: 'Cheque',
    upi: 'UPI',
    bank_transfer: 'Bank transfer',
    other: 'Other',
};
/** "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only". */
export function amountInWords(amount) {
    const paiseTotal = Math.round(Math.abs(amount) * 100);
    const rupees = Math.floor(paiseTotal / 100);
    const paise = paiseTotal % 100;
    const words = `Rupees ${numberToIndianWords(rupees)}`;
    return `${paise ? `${words} and ${numberToIndianWords(paise)} Paise` : words} Only`;
}
/** "21 Oct 2026, 10:42 am" in the business timezone. */
export function formatReceiptDate(d) {
    return new Intl.DateTimeFormat('en-IN', {
        timeZone: BUSINESS_TZ,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    }).format(d);
}
export function renderPaymentReceipt(input) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A5',
            margin: 0,
            info: {
                Title: `Payment receipt ${input.receiptNumber}`,
                Author: env.COMPANY_NAME,
                Subject: `Receipt ${input.receiptNumber}`,
            },
        });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageW = doc.page.width; // 420
        const PAD = 28;
        const contentW = pageW - PAD * 2;
        /* Header band */
        const headerH = 74;
        doc.rect(0, 0, pageW, headerH).fill(COLOR.brand);
        doc.fillColor(COLOR.white).font('Helvetica-Bold').fontSize(15).text(env.COMPANY_NAME, PAD, 20, {
            width: contentW,
            ellipsis: true,
            lineBreak: false,
        });
        doc.font('Helvetica').fontSize(10).text('PAYMENT RECEIPT', PAD, 44, { width: contentW, characterSpacing: 1 });
        /* Receipt number + date */
        let y = headerH + 18;
        const half = contentW / 2;
        const label = (text, x, yy, width) => doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(text.toUpperCase(), x, yy, { width });
        const value = (text, x, yy, width, size = 10.5) => doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(size).text(text, x, yy, { width });
        label('Receipt No.', PAD, y, half);
        value(input.receiptNumber, PAD, y + 11, half);
        label('Date', PAD + half, y, half);
        value(formatReceiptDate(input.collectedAt), PAD + half, y + 11, half);
        y += 40;
        /* Received from */
        label('Received from', PAD, y, contentW);
        value(input.client.name, PAD, y + 11, contentW, 12);
        y = doc.y + 2;
        const addr = input.client.address;
        const addressLine = [addr?.line1, addr?.line2, addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(', ');
        const extra = [input.client.company && input.client.company !== input.client.name ? input.client.company : '', addressLine, input.client.phone]
            .filter(Boolean)
            .join(' · ');
        if (extra) {
            doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9).text(extra, PAD, y, { width: contentW });
            y = doc.y;
        }
        y += 14;
        /* Amount card */
        const cardH = 70;
        doc.roundedRect(PAD, y, contentW, cardH, 6).fill(COLOR.cardBg);
        doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text('AMOUNT RECEIVED', PAD + 14, y + 12);
        doc.fillColor(COLOR.brand).font('Helvetica-Bold').fontSize(20).text(inr(input.amount), PAD + 14, y + 24, {
            width: contentW - 28,
        });
        doc.fillColor(COLOR.text).font('Helvetica-Oblique').fontSize(8.5).text(amountInWords(input.amount), PAD + 14, y + 50, {
            width: contentW - 28,
        });
        y += cardH + 16;
        /* Details */
        const rows = [
            ['Payment mode', METHOD_LABELS[input.method] ?? input.method],
            ['Reference', input.reference || '—'],
            ['Against order', input.orderNumber || '—'],
            ['Collected by', input.collectedBy.code ? `${input.collectedBy.name} (${input.collectedBy.code})` : input.collectedBy.name],
            ['Status', input.status.charAt(0).toUpperCase() + input.status.slice(1)],
        ];
        for (const [k, v] of rows) {
            doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9).text(k, PAD, y, { width: 110 });
            doc.fillColor(COLOR.text).font('Helvetica-Bold').fontSize(9.5).text(v, PAD + 115, y, { width: contentW - 115 });
            y = Math.max(doc.y, y + 12) + 6;
            doc.moveTo(PAD, y - 3).lineTo(PAD + contentW, y - 3).lineWidth(0.5).strokeColor(COLOR.divider).stroke();
        }
        if (input.notes) {
            y += 4;
            doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8.5).text(`Notes: ${input.notes}`, PAD, y, { width: contentW });
            y = doc.y;
        }
        /* Footer */
        doc
            .fillColor(COLOR.muted)
            .font('Helvetica')
            .fontSize(7.5)
            .text('This is a computer-generated receipt and does not need a signature.', PAD, doc.page.height - 36, {
            width: contentW,
            align: 'center',
        });
        doc.end();
    });
}
//# sourceMappingURL=field-receipt-pdf.service.js.map