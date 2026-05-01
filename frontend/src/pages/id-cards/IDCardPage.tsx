import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreditCard,
  Download,
  Search,
  User,
  QrCode,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { employeesApi, type Employee } from '@/lib/systemcore.api';

interface CardTemplate {
  _id: string;
  name: string;
  orientation: 'portrait' | 'landscape';
  bgClass: string;
  printColor: string;
}

const TEMPLATES: CardTemplate[] = [
  { _id: 'corporate-blue', name: 'Corporate Blue', orientation: 'landscape', bgClass: 'bg-blue-600', printColor: '#2563eb' },
  { _id: 'modern-green', name: 'Modern Green', orientation: 'portrait', bgClass: 'bg-emerald-600', printColor: '#059669' },
  { _id: 'professional-dark', name: 'Professional Dark', orientation: 'landscape', bgClass: 'bg-slate-800', printColor: '#1e293b' },
  { _id: 'minimal-white', name: 'Minimal White', orientation: 'portrait', bgClass: 'bg-white border-2 border-slate-200', printColor: '#ffffff' },
];

const COMPANY_NAME = 'DD HRMS';

function fmtMonthYear(d: Date | string | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function validUntilFor(emp: Employee | undefined): string {
  if (!emp) return '—';
  const join = new Date(emp.joiningDate);
  if (Number.isNaN(join.getTime())) return '—';
  const expiry = new Date(join);
  expiry.setFullYear(expiry.getFullYear() + 5);
  return fmtMonthYear(expiry);
}

export default function IDCardPage(): ReactElement {
  const [selectedTemplate, setSelectedTemplate] = useState<string>(TEMPLATES[0]._id);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: empResp, isLoading } = useQuery({
    queryKey: ['employees-id-card', debouncedSearch],
    queryFn: () =>
      employeesApi.list({
        page: 1,
        limit: 20,
        search: debouncedSearch || undefined,
      }),
  });
  const employees: Employee[] = empResp?.data ?? [];

  const template = TEMPLATES.find((t) => t._id === selectedTemplate) ?? TEMPLATES[0];
  const employee = useMemo(
    () => employees.find((e) => e._id === selectedEmployeeId),
    [employees, selectedEmployeeId],
  );

  const cardRef = useRef<HTMLDivElement | null>(null);

  const handlePrint = (): void => {
    if (!employee || !cardRef.current) return;
    const html = cardRef.current.outerHTML;
    const win = window.open('', '_blank', 'width=600,height=400');
    if (!win) return;
    win.document.write(`<!doctype html>
<html>
<head>
  <title>ID Card — ${employee.firstName} ${employee.lastName}</title>
  <meta charset="utf-8" />
  <style>
    @page { size: ${template.orientation === 'landscape' ? '85.6mm 53.98mm' : '53.98mm 85.6mm'}; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { display: flex; align-items: center; justify-content: center; padding: 16px; }
    .id-card { box-shadow: none !important; }
  </style>
</head>
<body>${html}
<script>window.onload = () => { window.print(); window.close(); };</script>
</body>
</html>`);
    win.document.close();
  };

  const isWhite = template._id === 'minimal-white';
  const textPrimary = isWhite ? 'text-slate-900' : 'text-white';
  const textMuted = isWhite ? 'text-slate-600' : 'text-white/80';
  const surface = isWhite ? 'bg-slate-100' : 'bg-white/20 backdrop-blur-sm';
  const surfaceText = isWhite ? 'text-slate-500' : 'text-white/70';

  return (
    <div className="space-y-6">
      <PageHeader title="ID Cards" description="Generate and print employee identification cards" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Templates + Employee Selection */}
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Select template</h2>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl._id}
                  onClick={() => setSelectedTemplate(tmpl._id)}
                  className={cn(
                    'group relative rounded-lg border-2 p-1 transition-colors',
                    selectedTemplate === tmpl._id ? 'border-primary' : 'border-border hover:border-primary/30',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center rounded-md text-xs font-medium',
                      tmpl.bgClass,
                      tmpl._id === 'minimal-white' ? 'text-slate-400' : 'text-white',
                      tmpl.orientation === 'landscape' ? 'h-20' : 'h-28',
                    )}
                  >
                    <CreditCard className="size-6 opacity-60" />
                  </div>
                  <p className="mt-1.5 text-center text-xs font-medium">{tmpl.name}</p>
                  <Badge variant="outline" className="absolute right-2 top-2 text-[9px]">
                    {tmpl.orientation}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Select employee</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, employee ID, or email"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : employees.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No employees found{debouncedSearch ? ` for "${debouncedSearch}"` : ''}
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {employees.map((emp) => (
                  <button
                    key={emp._id}
                    onClick={() => setSelectedEmployeeId(emp._id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      selectedEmployeeId === emp._id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                    )}
                  >
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {emp.employeeId} · {emp.designation?.name ?? '—'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Card Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Card preview</h2>
            <Button className="gap-2" disabled={!employee} onClick={handlePrint}>
              <Download className="size-4" />
              Print / Save PDF
            </Button>
          </div>

          <div
            ref={cardRef}
            className={cn(
              'id-card relative mx-auto overflow-hidden rounded-xl shadow-lg',
              template.orientation === 'landscape' ? 'aspect-[1.586/1] w-full max-w-md' : 'aspect-[1/1.586] w-72',
              template.bgClass,
            )}
            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          >
            <div className={cn('relative flex h-full flex-col justify-between p-6', textPrimary)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="size-5" />
                  <span className="text-sm font-bold tracking-wide">{COMPANY_NAME}</span>
                </div>
                <Badge variant="outline" className={cn('text-[9px]', isWhite ? 'border-slate-300 text-slate-600' : 'border-white/30 text-white')}>
                  EMPLOYEE
                </Badge>
              </div>

              <div className="flex items-center gap-4">
                <div className={cn('flex size-20 items-center justify-center overflow-hidden rounded-lg', surface)}>
                  {employee?.profileImage ? (
                    <img src={employee.profileImage} alt="" className="size-full object-cover" />
                  ) : (
                    <User className={cn('size-10', surfaceText)} />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-lg font-bold">
                    {employee ? `${employee.firstName} ${employee.lastName}` : 'Employee Name'}
                  </p>
                  <p className={cn('truncate text-xs', textMuted)}>
                    {employee?.designation?.name ?? 'Designation'}
                  </p>
                  <p className={cn('truncate text-xs', textMuted)}>
                    {employee?.department?.name ?? 'Department'}
                  </p>
                  <p className={cn('truncate font-mono text-xs', textMuted)}>
                    {employee?.employeeId ?? 'EMP-—'}
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div className="space-y-0.5">
                  <p className={cn('text-[10px]', textMuted)}>Valid Until</p>
                  <p className="text-xs font-medium">{validUntilFor(employee)}</p>
                </div>
                <div className={cn('flex size-14 items-center justify-center rounded-lg', surface)}>
                  <QrCode className={cn('size-8', surfaceText)} />
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {employee ? 'Click "Print / Save PDF" to print the card or save as PDF.' : 'Select an employee to populate the card.'}
          </p>
        </div>
      </div>
    </div>
  );
}
