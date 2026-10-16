import { useMemo, useState, type ReactElement } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useMyPayslips } from '@/hooks/use-payroll';
import { payrollApi, type PayrollRecord } from '@/lib/payroll.api';
import { inr } from './PayrollDashboardPage';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function periodLabel(record: PayrollRecord): string {
  const c = typeof record.cycleId === 'object' ? record.cycleId : null;
  if (!c) return '';
  return `${MONTHS[c.month - 1]} ${c.year}`;
}

export default function MyPayslipsPage(): ReactElement {
  const { data, isLoading } = useMyPayslips();
  const records = data?.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const selected = useMemo(
    () => records.find((r) => r._id === selectedId) ?? records[0] ?? null,
    [records, selectedId],
  );

  const handleDownload = async (): Promise<void> => {
    if (!selected || downloading) return;
    setDownloading(true);
    try {
      const res = await payrollApi.payslipUrl(selected._id);
      const url = res?.data?.url;
      if (!url) throw new Error('No URL returned');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to download payslip';
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  const ytd = useMemo(() => {
    if (!selected) return { gross: 0, deductions: 0, net: 0 };
    const cycleYear =
      typeof selected.cycleId === 'object' ? selected.cycleId.year : new Date().getFullYear();
    const yearRecords = records.filter(
      (r) => typeof r.cycleId === 'object' && r.cycleId.year === cycleYear,
    );
    return yearRecords.reduce(
      (acc, r) => ({
        gross: acc.gross + r.grossSalary,
        deductions: acc.deductions + r.totalDeductions,
        net: acc.net + r.netSalary,
      }),
      { gross: 0, deductions: 0, net: 0 },
    );
  }, [records, selected]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Payslips"
        description="View and download your monthly payslips"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'My Payslips' }]}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No payslips available yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Period:</label>
            <Select
              value={selected?._id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-60"
            >
              {records.map((r) => (
                <option key={r._id} value={r._id}>
                  {periodLabel(r)}
                </option>
              ))}
            </Select>
            {selected && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download PDF
              </button>
            )}
          </div>

          {selected && (
            <Card>
              <CardHeader>
                <CardTitle>{periodLabel(selected)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                      Earnings
                    </h4>
                    <table className="w-full text-sm">
                      <tbody>
                        {selected.earnings.map((e, i) => (
                          <tr key={i} className="border-b border-border/40">
                            <td className="py-1.5">{e.name}</td>
                            <td className="py-1.5 text-right">{inr(e.amount)}</td>
                          </tr>
                        ))}
                        <tr className="font-semibold">
                          <td className="py-2">Gross</td>
                          <td className="py-2 text-right">{inr(selected.grossSalary)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                      Deductions
                    </h4>
                    <table className="w-full text-sm">
                      <tbody>
                        {selected.deductions.map((d, i) => (
                          <tr key={i} className="border-b border-border/40">
                            <td className="py-1.5">{d.name}</td>
                            <td className="py-1.5 text-right">{inr(d.amount)}</td>
                          </tr>
                        ))}
                        {selected.loanDeduction > 0 && (
                          <tr className="border-b border-border/40">
                            <td className="py-1.5">Loan EMI</td>
                            <td className="py-1.5 text-right">
                              {inr(selected.loanDeduction)}
                            </td>
                          </tr>
                        )}
                        <tr className="font-semibold">
                          <td className="py-2">Total Deductions</td>
                          <td className="py-2 text-right">
                            {inr(selected.totalDeductions)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Net Pay
                    </span>
                    <span className="text-2xl font-bold text-primary">
                      {inr(selected.netSalary)}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                    Year-to-date
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">YTD Earnings</div>
                      <div className="font-semibold">{inr(ytd.gross)}</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">YTD Deductions</div>
                      <div className="font-semibold">{inr(ytd.deductions)}</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">YTD Net</div>
                      <div className="font-semibold">{inr(ytd.net)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
