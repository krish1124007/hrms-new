import { useRef, useState, type ReactElement } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useImportSites } from '@/hooks/use-field';
import { SITE_IMPORT_COLUMNS, type SiteImportResult } from '@/lib/field.api';

const MAX_BYTES = 10 * 1024 * 1024;

/** A blank workbook with the import columns and one example row. */
function downloadTemplate(): void {
  const example = [
    'Andheri Metro Site',
    'Project site',
    'Plot 12, MIDC',
    'Mumbai',
    'Maharashtra',
    '400093',
    19.1197,
    72.8464,
    200,
    'Anita Rao',
    '9800000000',
    'EMP-001, EMP-002',
  ];
  const ws = XLSX.utils.aoa_to_sheet([[...SITE_IMPORT_COLUMNS], example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sites');
  XLSX.writeFile(wb, 'site_import_template.xlsx');
}

/**
 * Bulk-add sites from an Excel sheet (`POST /field/sites/import`). The server
 * creates new sites, updates ones it already knows, and lists the rows it
 * could not use with the reason.
 */
export function SiteImportDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [result, setResult] = useState<SiteImportResult | null>(null);
  const importSites = useImportSites();

  const close = (): void => {
    if (importSites.isPending) return;
    setFile(null);
    setFileError('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  const choose = (f: File | undefined): void => {
    setResult(null);
    if (!f) return setFile(null);
    if (!/\.xlsx$/i.test(f.name)) {
      setFile(null);
      setFileError('Choose an Excel file (.xlsx).');
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setFileError('That file is larger than 10 MB.');
      return;
    }
    setFileError('');
    setFile(f);
  };

  return (
    <Dialog open={open} onClose={close} size="lg">
      <DialogHeader>
        <DialogTitle>Import sites from Excel</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[75vh] space-y-4 overflow-y-auto">
        <div className="space-y-2 text-sm">
          <p>The first sheet is read; its first row must have these column headings:</p>
          <p className="rounded-md bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed">
            {SITE_IMPORT_COLUMNS.join(' · ')}
          </p>
          <p className="text-xs text-muted-foreground">
            Name, Type, Latitude and Longitude are required. Radius is in metres (the default radius when empty).
            Assigned employee IDs are employee codes separated by commas. A row matching an existing site updates it.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            Download template
          </Button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="site-import-file" className="text-sm font-medium">
            Excel file
          </label>
          <input
            id="site-import-file"
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          {file && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileSpreadsheet className="size-3" />
              {file.name}
            </p>
          )}
          {fileError && <p className="text-xs text-destructive">{fileError}</p>}
        </div>

        {result && (
          <div className="space-y-2 rounded-md border border-border p-3 text-sm" role="status">
            <p className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-4 text-success" />
              {result.created} created, {result.updated} updated
              {result.errors.length > 0 ? `, ${result.errors.length} skipped` : ''}
            </p>
            {result.errors.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="w-16 py-1 font-medium">Row</th>
                    <th className="py-1 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e) => (
                    <tr key={`${e.row}-${e.message}`} className="border-t border-border">
                      <td className="py-1 font-mono">{e.row}</td>
                      <td className="py-1">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={importSites.isPending}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        <Button
          disabled={!file}
          loading={importSites.isPending}
          onClick={() =>
            file &&
            importSites.mutate(file, {
              onSuccess: (res) => {
                setResult(res.data);
                setFile(null);
                if (fileRef.current) fileRef.current.value = '';
              },
            })
          }
        >
          <Upload className="size-4" />
          Import
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
