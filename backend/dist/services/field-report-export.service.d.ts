/**
 * Field report files: an Excel workbook (`xlsx`, one sheet per table, the
 * header row first) or a PDF built with pdfkit the way the payslips are —
 * A4 (landscape here), the brand header band with the logo or company name,
 * then each table, repeating its header row on every page.
 */
import type { Response } from 'express';
export type Cell = string | number | null | undefined;
export interface ReportTable {
    /** Sheet name, and the table's heading in the PDF when there are several. */
    name: string;
    columns: string[];
    rows: Cell[][];
    /** Relative column widths in the PDF (default equal). */
    widths?: number[];
}
export interface ReportFile {
    title: string;
    subtitle?: string;
    /** Download name without the extension. */
    filename: string;
    tables: ReportTable[];
}
export type ReportFormat = 'xlsx' | 'pdf';
export declare const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** `15 Oct 2026, 10:00` in IST ('' when absent). */
export declare function formatDateTime(at: Date | string | null | undefined): string;
/** `10:00` in IST ('' when absent). */
export declare function formatTime(at: Date | string | null | undefined): string;
/** A file-name-safe piece: letters, digits, `-` and `_` only. */
export declare const safeFilePart: (s: string) => string;
export declare function workbookBuffer(file: ReportFile): Buffer;
export declare function pdfBuffer(file: ReportFile): Promise<Buffer>;
/** Answer with the report as a download. */
export declare function sendReportFile(res: Response, format: ReportFormat, file: ReportFile): Promise<void>;
//# sourceMappingURL=field-report-export.service.d.ts.map