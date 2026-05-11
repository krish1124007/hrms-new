/**
 * Escape a single CSV cell per RFC 4180: quote if the value contains
 * `,` / `"` / newline, and double any embedded quotes.
 */
function escapeCell(v) {
    if (v === null || v === undefined)
        return '';
    const s = typeof v === 'string' ? v : String(v);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
export async function exportCSV(res, basename, opts) {
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
    for await (const row of opts.rows) {
        const line = opts.columns.map((c) => escapeCell(c.value(row))).join(',');
        res.write(line + '\n');
    }
    res.end();
}
/**
 * Helper for the common case of a plain array of plain objects (e.g. a
 * `.lean()` query result already in memory).
 */
export async function exportArrayAsCSV(res, basename, rows, 
// Optional column order/renaming. If omitted, we infer from the first row's keys.
columns) {
    const inferredCols = columns ??
        (rows.length === 0
            ? []
            : Object.keys(rows[0]).map((k) => ({
                header: k,
                value: (r) => r[k],
            })));
    await exportCSV(res, basename, {
        columns: inferredCols,
        rows,
    });
}
//# sourceMappingURL=export.js.map