import { useMemo, useState, type ReactElement } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useWeeklyTimesheet } from '@/hooks/use-pmcore';
import { Clock } from 'lucide-react';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday-start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDayLabel(iso: string): { day: string; date: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  };
}

export default function TimesheetPage(): ReactElement {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const weekStartIso = useMemo(() => weekStart.toISOString().slice(0, 10), [weekStart]);

  const { data, isLoading } = useWeeklyTimesheet({ weekStart: weekStartIso });
  const sheet = data?.data;

  const shiftWeek = (delta: number): void => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * 7);
    setWeekStart(next);
  };

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const grandTotal = (sheet?.rows ?? []).reduce((s, r) => s + r.total, 0);
  const dayTotals: Record<string, number> = {};
  (sheet?.days ?? []).forEach((d) => {
    dayTotals[d] = (sheet?.rows ?? []).reduce((s, r) => s + (r.perDay[d] ?? 0), 0);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Timesheet"
        description="Weekly time entries grouped by project"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Timesheets' }]}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              This week
            </Button>
            <Button variant="outline" size="sm" onClick={() => shiftWeek(1)}>
              <ChevronRight className="size-4" />
            </Button>
            <span className="ml-3 text-sm font-medium">
              {weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} —{' '}
              {weekEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Week total:</span>
            <span className="font-mono text-lg font-bold tabular-nums">{grandTotal.toFixed(1)} h</span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !sheet || sheet.rows.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Clock}
              title="No time logged this week"
              description="Log time from any project's Time tab"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Project
                  </th>
                  {sheet.days.map((d) => {
                    const lbl = fmtDayLabel(d);
                    return (
                      <th
                        key={d}
                        className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase text-muted-foreground"
                      >
                        <div>{lbl.day}</div>
                        <div className="font-mono text-[10px] font-normal text-muted-foreground/70">
                          {lbl.date}
                        </div>
                      </th>
                    );
                  })}
                  <th className="w-24 px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.project?._id ?? Math.random()} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-3 rounded"
                          style={{ backgroundColor: row.project?.color ?? '#888' }}
                        />
                        <span className="font-medium">{row.project?.name ?? 'Unknown'}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.project?.code}
                        </span>
                      </div>
                    </td>
                    {sheet.days.map((d) => (
                      <td
                        key={d}
                        className="px-2 py-3 text-center font-mono text-xs tabular-nums"
                      >
                        {row.perDay[d] ? row.perDay[d].toFixed(1) : ''}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {row.total.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-muted/30">
                <tr>
                  <td className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                    Daily total
                  </td>
                  {sheet.days.map((d) => (
                    <td
                      key={d}
                      className="px-2 py-3 text-center font-mono text-xs font-semibold tabular-nums"
                    >
                      {dayTotals[d] ? dayTotals[d].toFixed(1) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono text-base font-bold tabular-nums">
                    {grandTotal.toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
