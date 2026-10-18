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

interface EmployeeImportModalProps {
  open: boolean;
  onClose: () => void;
}

interface ParsedRow {
  firstName: string;
  lastName: string;
  email: string;
  joiningDate: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  departmentName?: string;
  designationName?: string;
  status?: string;
  /** Needed for an exit status (resigned / terminated / inactive). */
  exitDate?: string;
  employmentType?: string;
  workLocation?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  rawRow: Record<string, any>;
}

export function EmployeeImportModal({ open, onClose }: EmployeeImportModalProps): ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<EmployeeImportResult | null>(null);

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
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        const parsed: ParsedRow[] = data.map((row) => {
          const keys = Object.keys(row);
          const findKey = (pattern: RegExp) => keys.find((k) => pattern.test(k.trim()));

          const firstNameKey = findKey(/first.*name|^fname$/i);
          const lastNameKey = findKey(/last.*name|^lname$/i);
          const emailKey = findKey(/employee.*mail|mail.*id|email|employee.*email|^mail$/i);
          const joiningDateKey = findKey(/joining.*date|join.*date|^date.*joined$/i);
          const phoneKey = findKey(/phone|mobile|contact/i);
          const dobKey = findKey(/date.*of.*birth|^dob$/i);
          const genderKey = findKey(/^gender$/i);
          const departmentKey = findKey(/^department$/i);
          const designationKey = findKey(/^designation$/i);
          const statusKey = findKey(/^status$/i);
          const exitDateKey = findKey(/exit.*date|last.*working.*day|relieving.*date/i);
          const employmentTypeKey = findKey(/employment.*type/i);
          const workLocationKey = findKey(/work.*location/i);
          const bankNameKey = findKey(/bank.*name/i);
          const accNumberKey = findKey(/account.*number|^a\/c.*no/i);
          const ifscKey = findKey(/ifsc/i);
          const emContactNameKey = findKey(/emergency.*contact.*name/i);
          const emContactPhoneKey = findKey(/emergency.*contact.*phone|emergency.*phone/i);

          const parseDate = (rawDate: any) => {
            if (!rawDate) return '';
            if (typeof rawDate === 'number') {
              const date = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
              return date.toISOString().slice(0, 10);
            }
            return new Date(rawDate).toISOString().slice(0, 10);
          };

          const formattedDate = parseDate(row[joiningDateKey ?? '']);
          const formattedDob = parseDate(row[dobKey ?? '']);

          return {
            firstName: String(row[firstNameKey ?? ''] ?? '').trim(),
            lastName: String(row[lastNameKey ?? ''] ?? '').trim(),
            email: String(row[emailKey ?? ''] ?? '').trim(),
            joiningDate: formattedDate,
            phone: String(row[phoneKey ?? ''] ?? '').trim(),
            dateOfBirth: formattedDob,
            gender: String(row[genderKey ?? ''] ?? '').trim().toLowerCase(),
            departmentName: String(row[departmentKey ?? ''] ?? '').trim(),
            designationName: String(row[designationKey ?? ''] ?? '').trim(),
            status: String(row[statusKey ?? ''] ?? '').trim().toLowerCase(),
            exitDate: parseDate(row[exitDateKey ?? '']),
            employmentType: String(row[employmentTypeKey ?? ''] ?? '').trim().toLowerCase(),
            workLocation: String(row[workLocationKey ?? ''] ?? '').trim(),
            bankName: String(row[bankNameKey ?? ''] ?? '').trim(),
            accountNumber: String(row[accNumberKey ?? ''] ?? '').trim(),
            ifscCode: String(row[ifscKey ?? ''] ?? '').trim(),
            emergencyContactName: String(row[emContactNameKey ?? ''] ?? '').trim(),
            emergencyContactPhone: String(row[emContactPhoneKey ?? ''] ?? '').trim(),
            rawRow: row,
          };
        });

        setPreviewRows(parsed.filter((r) => r.firstName && r.lastName && r.email && r.joiningDate));
      } catch (err) {
        toast.error('Failed to parse Excel file. Please check file format.');
      }
    };
    reader.readAsBinaryString(selected);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'First Name': 'John',
        'Last Name': 'Doe',
        'Email': 'john.doe@example.com',
        'Joining Date': '2024-01-15',
        'Phone': '1234567890',
      },
      {
        'First Name': 'Jane',
        'Last Name': 'Smith',
        'Email': 'jane.smith@example.com',
        'Joining Date': '2024-02-01',
        'Phone': '0987654321',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  const handleSubmit = () => {
    if (previewRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }

    const payload = previewRows.map((r) => {
      const p: any = {
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        joiningDate: r.joiningDate,
        phone: r.phone,
      };
      if (r.dateOfBirth) p.dateOfBirth = r.dateOfBirth;
      if (r.gender) p.gender = r.gender;
      if (r.departmentName) p.departmentName = r.departmentName;
      if (r.designationName) p.designationName = r.designationName;
      if (r.status) p.status = r.status;
      if (r.exitDate) p.exitDate = r.exitDate;
      if (r.employmentType) p.employmentType = r.employmentType;
      if (r.workLocation) p.workLocation = r.workLocation;
      if (r.bankName || r.accountNumber || r.ifscCode) {
        p.bankDetails = {
          bankName: r.bankName,
          accountNumber: r.accountNumber,
          ifscCode: r.ifscCode,
        };
      }
      if (r.emergencyContactName || r.emergencyContactPhone) {
        p.emergencyContact = {
          name: r.emergencyContactName,
          phone: r.emergencyContactPhone,
        };
      }
      return p;
    });

    importMutation.mutate(payload, {
      onSuccess: (res) => {
        setImportResult(res.data);
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
          Import Employees from Excel
        </DialogTitle>
        <DialogDescription>
          Upload an Excel sheet (.xlsx, .xls, .csv) containing employee details.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div>
            <p className="font-medium text-foreground">Excel Column Format Required:</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              First Name | Last Name | Email | Joining Date | Phone (Optional)
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
                    Preview Data ({previewRows.length} Valid Rows Detected)
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
                        <th className="p-2 font-medium">First Name</th>
                        <th className="p-2 font-medium">Last Name</th>
                        <th className="p-2 font-medium">Email</th>
                        <th className="p-2 font-medium">Joining Date</th>
                        <th className="p-2 font-medium">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {previewRows.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="p-2 text-muted-foreground">{idx + 1}</td>
                          <td className="p-2 font-medium">{row.firstName}</td>
                          <td className="p-2 font-medium">{row.lastName}</td>
                          <td className="p-2 font-mono text-primary">{row.email}</td>
                          <td className="p-2 font-mono">{row.joiningDate}</td>
                          <td className="p-2 font-mono">{row.phone || '—'}</td>
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
                <h4 className="font-semibold text-sm">Import Finished</h4>
                <p className="text-xs mt-0.5">
                  {importResult.created} created · {importResult.updated ?? 0} updated ·{' '}
                  {importResult.skipped ?? 0} skipped · {importResult.errors ?? 0} with errors
                </p>
              </div>
            </div>

            {importResult.failed.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                  <AlertCircle className="size-4" />
                  Skipped or failed rows ({importResult.failed.length}):
                </div>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto text-destructive/90">
                  {importResult.failed.map((err, i) => (
                    <li key={i}>
                      [{err.email}] {err.reason}
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
                  <Upload className="size-4" /> Import {previewRows.length} Employees
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
