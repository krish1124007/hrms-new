import type { Response } from 'express';
/**
 * Streaming CSV export.
 *
 * Used by list-endpoint export buttons ("Download as CSV"). Streams rows
 * directly to the response so a 100k-row export doesn't OOM the process.
 *
 * Excel compatibility: prefixes the output with a UTF-8 BOM so Excel on
 * Windows recognises Unicode (otherwise non-ASCII employee names turn
 * into mojibake). The BOM is harmless everywhere else.
 *
 * Usage:
 *   exportCSV(res, 'employees', {
 *     columns: [
 *       { header: 'Employee ID', value: (e) => e.employeeId },
 *       { header: 'Name', value: (e) => `${e.firstName} ${e.lastName}` },
 *       { header: 'Joined', value: (e) => e.joiningDate?.toISOString() },
 *     ],
 *     rows: await Employee.find(filter).cursor(),   // async iterable
 *   });
 */
export interface CSVColumn<T> {
    header: string;
    value: (row: T) => unknown;
}
export interface ExportCSVOptions<T> {
    columns: CSVColumn<T>[];
    rows: AsyncIterable<T> | Iterable<T>;
    filename?: string;
}
export declare function exportCSV<T>(res: Response, basename: string, opts: ExportCSVOptions<T>): Promise<void>;
/**
 * Helper for the common case of a plain array of plain objects (e.g. a
 * `.lean()` query result already in memory).
 */
export declare function exportArrayAsCSV<T extends Record<string, unknown>>(res: Response, basename: string, rows: T[], columns?: CSVColumn<T>[]): Promise<void>;
//# sourceMappingURL=export.d.ts.map