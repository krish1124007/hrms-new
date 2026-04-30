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

/**
 * Escape a single CSV cell per RFC 4180: quote if the value contains
 * `,` / `"` / newline, and double any embedded quotes.
 */
function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportCSV<T>(
  res: Response,
  basename: string,
  opts: ExportCSVOptions<T>,
): Promise<void> {
  const filename = opts.filename ?? `${basename}-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  // Disable compression for streamed exports — Express's compression
  // middleware buffers the whole response if it thinks it's small enough,
  // which defeats the streaming. Prepending the BOM here also ensures
  // Excel reads the file as UTF-8.
  res.setHeader('Content-Encoding', 'identity');

  // UTF-8 BOM for Excel compatibility
  res.write('\ufeff');

  // Header row
  res.write(opts.columns.map((c) => escapeCell(c.header)).join(',') + '\n');

  // Body — stream rows. Works for both sync iterables and Mongoose cursors.
  for await (const row of opts.rows as AsyncIterable<T>) {
    const line = opts.columns.map((c) => escapeCell(c.value(row))).join(',');
    res.write(line + '\n');
  }

  res.end();
}

/**
 * Helper for the common case of a plain array of plain objects (e.g. a
 * `.lean()` query result already in memory).
 */
export async function exportArrayAsCSV<T extends Record<string, unknown>>(
  res: Response,
  basename: string,
  rows: T[],
  // Optional column order/renaming. If omitted, we infer from the first row's keys.
  columns?: CSVColumn<T>[],
): Promise<void> {
  const inferredCols: CSVColumn<T>[] =
    columns ??
    (rows.length === 0
      ? []
      : Object.keys(rows[0]).map<CSVColumn<T>>((k) => ({
          header: k,
          value: (r) => r[k],
        })));
  await exportCSV(res, basename, {
    columns: inferredCols,
    rows,
  });
}
