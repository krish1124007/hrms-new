import { useState, type ReactElement, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useImportEmployees } from '@/hooks/use-systemcore';
import type { EmployeeImportResult } from '@/lib/systemcore.api';
import { toast } from 'sonner';
import {
  IMPORT_COLUMNS,
  parseEmployeeSheet,
  templateRows,
  type ReadyRow,
  type SkippedRow,
} from './employee-import';

interface EmployeeImportModalProps {
  open: boolean;
  onClose: () => void;
}

export function EmployeeImportModal({ open, onClose }: EmployeeImportModalProps): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [readyRows, setReadyRows] = useState<ReadyRow[]>([]);
  const [skippedRows, setSkippedRows] = useState<SkippedRow[]>([]);
  const [importResult, setImportResult] = useState<EmployeeImportResult | null>(null);
  /** Spreadsheet row of each submitted row — the API numbers rows by position in the request. */
  const [submittedSheetRows, setSubmittedSheetRows] = useState<number[]>([]);

  const importMutation = useImportEmployees();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const { ready, skipped } = parseEmployeeSheet(data);
        setReadyRows(ready);
        setSkippedRows(skipped);
      } catch {
        toast.error('Failed to parse Excel file. Please check file format.');
      }
    };
    reader.readAsBinaryString(selected);
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(templateRows(), { header: IMPORT_COLUMNS.map((c) => c.header) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  const handleSubmit = () => {
    if (readyRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }
    setSubmittedSheetRows(readyRows.map((r) => r.sheetRow));
    // The import row also takes `departmentName` / `designationName` / `status`
    // / `exitDate` / `employeeId`, which the create-employee input type lacks.
    const payload = readyRows.map((r) => r.payload) as unknown as Parameters<
      typeof importMutation.mutate
    >[0];
    importMutation.mutate(payload, {
      onSuccess: (res) => {
        setImportResult(res.data);
      },
    });
  };

  const handleReset = () => {
    setFile(null);
    setReadyRows([]);
    setSkippedRows([]);
    setImportResult(null);
    setSubmittedSheetRows([]);
  };

  // Rows the server did not create or update, with their spreadsheet row.
  const serverProblems = (importResult?.rows ?? [])
    .filter((r) => r.status === 'skipped' || r.status === 'error')
    .map((r) => ({ ...r, sheetRow: submittedSheetRows[r.row - 1] }));

  return (
    <Dialog open={open} onClose={onClose} size="xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-primary" />
          Import Employees from Excel
        </DialogTitle>
        <DialogDescription>
          Upload an Excel sheet (.xlsx, .xls, .csv) containing employee details. A row whose e-mail
          belongs to an existing employee updates that employee.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium text-foreground">Columns (first row = headers)</p>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="size-4" /> Download Sample Excel Template
            </Button>
          </div>
          <ul className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            {IMPORT_COLUMNS.map((c) => (
              <li key={c.header}>
                <span className="font-medium text-foreground">{c.header}</span>
                {c.required ? <span className="text-destructive"> *</span> : null}
                {c.note ? ` — ${c.note}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            * required. A row missing a required column, or with a date that cannot be read, is not
            imported — it is listed below with the reason.
          </p>
        </div>

        {!importResult ? (
          <>
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-6 transition-colors hover:border-primary/50">
              <Upload className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-foreground">
                {file ? file.name : 'Select or drop your Excel file here'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv files</p>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                aria-label="Employee spreadsheet"
                className="mt-3 cursor-pointer text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>

            {skippedRows.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-4" />
                  {skippedRows.length} row{skippedRows.length === 1 ? '' : 's'} will not be imported:
                </div>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-amber-800 dark:text-amber-300">
                  {skippedRows.map((r) => (
                    <li key={r.sheetRow}>
                      Row {r.sheetRow}
                      {r.email ? ` (${r.email})` : ''}: {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {readyRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Preview ({readyRows.length} row{readyRows.length === 1 ? '' : 's'} ready to import)
                  </h4>
                  <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
                    Clear File
                  </Button>
                </div>
                <div className="rounded-md border border-border overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm border-b border-border font-medium text-muted-foreground">
                      <tr>
                        <th className="p-2 font-medium">Row</th>
                        <th className="p-2 font-medium">First Name</th>
                        <th className="p-2 font-medium">Last Name</th>
                        <th className="p-2 font-medium">Email</th>
                        <th className="p-2 font-medium">Joining Date</th>
                        <th className="p-2 font-medium">Department</th>
                        <th className="p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {readyRows.slice(0, 50).map(({ sheetRow, payload }) => (
                        <tr key={sheetRow} className="hover:bg-muted/30">
                          <td className="p-2 text-muted-foreground">{sheetRow}</td>
                          <td className="p-2 font-medium">{payload.firstName}</td>
                          <td className="p-2 font-medium">{payload.lastName}</td>
                          <td className="p-2 font-mono text-primary">{payload.email}</td>
                          <td className="p-2 font-mono">{payload.joiningDate}</td>
                          <td className="p-2">{payload.departmentName || '—'}</td>
                          <td className="p-2">{payload.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {readyRows.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Showing first 50 rows of {readyRows.length}.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-6 shrink-0" />
              <div>
                <h4 className="font-semibold text-sm">Import Finished</h4>
                <p className="text-xs mt-0.5">
                  {importResult.created} created · {importResult.updated ?? 0} updated ·{' '}
                  {importResult.skipped ?? 0} skipped · {importResult.errors ?? 0} with errors
                  {skippedRows.length > 0 ? ` · ${skippedRows.length} not sent (see below)` : ''}
                </p>
              </div>
            </div>

            {(serverProblems.length > 0 || skippedRows.length > 0) && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                  <AlertCircle className="size-4" />
                  Rows not imported ({serverProblems.length + skippedRows.length}):
                </div>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto text-destructive/90">
                  {skippedRows.map((r) => (
                    <li key={`c-${r.sheetRow}`}>
                      Row {r.sheetRow}
                      {r.email ? ` (${r.email})` : ''}: {r.reason}
                    </li>
                  ))}
                  {serverProblems.map((r) => (
                    <li key={`s-${r.row}`}>
                      {r.sheetRow ? `Row ${r.sheetRow}` : `Entry ${r.row}`}
                      {r.email ? ` (${r.email})` : ''}: {r.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {!importResult ? (
          <>
            <Button variant="outline" onClick={onClose} disabled={importMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!file || readyRows.length === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Uploading & Processing...
                </>
              ) : (
                <>
                  <Upload className="size-4" /> Import {readyRows.length} Employees
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={handleReset}>
              Import Another File
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}
