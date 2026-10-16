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
import { useImportAssets } from '@/hooks/use-assets';
import { toast } from 'sonner';

interface AssetImportModalProps {
  open: boolean;
  onClose: () => void;
}

interface ParsedRow {
  employeeName: string;
  email: string;
  assetName: string;
  assetCode: string;
  category: string;
  status: string;
  condition: string;
  rawRow: Record<string, any>;
}

export function AssetImportModal({ open, onClose }: AssetImportModalProps): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<{
    createdCount: number;
    updatedCount: number;
    errorCount: number;
    errors: Array<{ row: number; email?: string; error: string }>;
  } | null>(null);

  const importMutation = useImportAssets();

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
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        const parsed: ParsedRow[] = data.map((row) => {
          const keys = Object.keys(row);
          const findKey = (pattern: RegExp) => keys.find((k) => pattern.test(k.trim()));

          const empNameKey = findKey(/employee.*name|emp.*name|^name$/i);
          const emailKey = findKey(/employee.*mail|mail.*id|email|employee.*email|^mail$/i);
          const assetNameKey = findKey(/asset.*name|^asset$|assets|device.*name/i);
          const assetCodeKey = findKey(/asset.*code|^code$/i);
          const categoryKey = findKey(/category|type/i);
          const statusKey = findKey(/status/i);
          const conditionKey = findKey(/condition|conediton/i);

          return {
            employeeName: String(row[empNameKey ?? ''] ?? '').trim(),
            email: String(row[emailKey ?? ''] ?? '').trim(),
            assetName: String(row[assetNameKey ?? ''] ?? '').trim(),
            assetCode: String(row[assetCodeKey ?? ''] ?? '').trim(),
            category: String(row[categoryKey ?? ''] ?? '').trim(),
            status: String(row[statusKey ?? ''] ?? '').trim(),
            condition: String(row[conditionKey ?? ''] ?? '').trim(),
            rawRow: row,
          };
        });

        setPreviewRows(parsed.filter((r) => r.assetName || r.assetCode || r.email));
      } catch (err) {
        toast.error('Failed to parse Excel file. Please check file format.');
      }
    };
    reader.readAsBinaryString(selected);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Employee Name': 'Khyati Trivedi',
        'Employee Mail ID': 'khyatitrivediddopc@gmail.com',
        'Asset Name': 'DES_DEL_OW_02',
        'Asset Code': '02',
        Category: 'Desktop',
        Status: 'Assigned',
        Condition: 'Good',
      },
      {
        'Employee Name': 'Harsha Ganwani',
        'Employee Mail ID': 'harshaganwani76@gmail.com',
        'Asset Name': 'DES_SAM_OW_03',
        'Asset Code': '03',
        Category: 'Desktop',
        Status: 'Assigned',
        Condition: 'Good',
      },
      {
        'Employee Name': 'Parikshit Thakkar',
        'Employee Mail ID': 'parikshit.thakkar.ddopc@gmail.com',
        'Asset Name': 'LAP_ACC_OW_04',
        'Asset Code': '04',
        Category: 'Laptop',
        Status: 'Assigned',
        Condition: 'Good',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');
    XLSX.writeFile(wb, 'asset_import_template.xlsx');
  };

  const handleSubmit = () => {
    if (!file && previewRows.length === 0) {
      toast.error('Please select an Excel file to upload');
      return;
    }

    const payload = file || previewRows.map((r) => r.rawRow);

    importMutation.mutate(payload, {
      onSuccess: (res) => {
        setImportResult(res.data);
      },
      onError: () => {
        if (file && previewRows.length > 0) {
          importMutation.mutate(
            previewRows.map((r) => r.rawRow),
            {
              onSuccess: (res) => {
                setImportResult(res.data);
              },
            },
          );
        }
      },
    });
  };

  const handleReset = () => {
    setFile(null);
    setPreviewRows([]);
    setImportResult(null);
  };

  return (
    <Dialog open={open} onClose={onClose} size="xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-primary" />
          Import Assets from Excel
        </DialogTitle>
        <DialogDescription>
          Upload an Excel sheet (.xlsx, .xls, .csv) containing employee mail IDs and asset details.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div>
            <p className="font-medium text-foreground">Excel Column Format Required:</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Employee Name | Employee Mail ID | Asset Name | Asset Code | Category | Status | Condition
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="size-4" /> Download Sample Excel Template
          </Button>
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
                className="mt-3 cursor-pointer text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>

            {previewRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Preview Data ({previewRows.length} Rows Detected)
                  </h4>
                  <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
                    Clear File
                  </Button>
                </div>
                <div className="rounded-md border border-border overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm border-b border-border font-medium text-muted-foreground">
                      <tr>
                        <th className="p-2 font-medium">#</th>
                        <th className="p-2 font-medium">Employee Name</th>
                        <th className="p-2 font-medium">Employee Mail ID</th>
                        <th className="p-2 font-medium">Asset Name</th>
                        <th className="p-2 font-medium">Asset Code</th>
                        <th className="p-2 font-medium">Category</th>
                        <th className="p-2 font-medium">Status</th>
                        <th className="p-2 font-medium">Condition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {previewRows.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="p-2 text-muted-foreground">{idx + 1}</td>
                          <td className="p-2 font-medium">{row.employeeName || '—'}</td>
                          <td className="p-2 font-mono text-primary">{row.email || '—'}</td>
                          <td className="p-2">{row.assetName || '—'}</td>
                          <td className="p-2 font-mono">{row.assetCode || '—'}</td>
                          <td className="p-2">{row.category || 'Desktop'}</td>
                          <td className="p-2">{row.status || 'Assigned'}</td>
                          <td className="p-2">{row.condition || 'Good'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewRows.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Showing first 50 rows of {previewRows.length} total rows.
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
                <h4 className="font-semibold text-sm">Import Finished Successfully!</h4>
                <p className="text-xs mt-0.5">
                  Created {importResult.createdCount} new assets and updated {importResult.updatedCount} existing records.
                </p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                  <AlertCircle className="size-4" />
                  Warnings / Errors ({importResult.errors.length}):
                </div>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto text-destructive/90">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.email ? `[${err.email}] ` : ''}
                      {err.error}
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
              disabled={!file || previewRows.length === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Uploading & Processing...
                </>
              ) : (
                <>
                  <Upload className="size-4" /> Import {previewRows.length} Assets
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
