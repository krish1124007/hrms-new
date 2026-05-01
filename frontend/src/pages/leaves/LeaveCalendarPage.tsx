import { useState, type ReactElement } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useLeaveCalendar } from '@/hooks/use-leaves';
import { cn } from '@/lib/utils';

export default function LeaveCalendarPage(): ReactElement {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const { data, isLoading } = useLeaveCalendar(
    monthStart.toISOString(),
    monthEnd.toISOString(),
  );

  const daysInMonth = monthEnd.getDate();
  const firstDow = monthStart.getDay();

  // Build a Date->requests map (key: YYYY-MM-DD)
  const byDay: Record<string, { name: string; color: string; pending: boolean }[]> = {};
  (data?.data ?? []).forEach((r) => {
    const start = new Date(r.startDate);
    const end = new Date(r.endDate);
    const cur = new Date(Math.max(start.getTime(), monthStart.getTime()));
    const stop = new Date(Math.min(end.getTime(), monthEnd.getTime()));
    while (cur <= stop) {
      const key = cur.toISOString().slice(0, 10);
      const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
      const lt = typeof r.leaveTypeId === 'object' ? r.leaveTypeId : null;
      byDay[key] ??= [];
      byDay[key].push({
        name: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
        color: lt?.color ?? '#3b82f6',
        pending: r.status === 'pending',
      });
      cur.setDate(cur.getDate() + 1);
    }
  });

  const cells: ReactElement[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`pad-${i}`} className="aspect-square" />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    const key = date.toISOString().slice(0, 10);
    const list = byDay[key] ?? [];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    cells.push(
      <div
        key={key}
        className={cn(
          'flex aspect-square flex-col rounded-md border border-border p-1.5 text-xs',
          isWeekend ? 'bg-muted/30' : 'bg-card',
        )}
      >
        <div className="font-medium text-foreground">{d}</div>
        <div className="mt-1 space-y-0.5 overflow-hidden">
          {list.slice(0, 3).map((l, i) => (
            <div
              key={i}
              className={cn(
                'truncate rounded px-1 py-0.5 text-[10px]',
                l.pending
                  ? 'border border-dashed bg-transparent'
                  : 'border border-transparent text-white',
              )}
              style={
                l.pending
                  ? { borderColor: l.color, color: l.color }
                  : { backgroundColor: l.color }
              }
              title={l.pending ? `${l.name} (pending)` : l.name}
            >
              {l.name}
            </div>
          ))}
          {list.length > 3 && (
            <div className="text-[10px] text-muted-foreground">+{list.length - 3} more</div>
          )}
        </div>
      </div>,
    );
  }

  const monthLabel = cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Calendar"
        description="Team leave overview"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Leaves' }, { label: 'Calendar' }]}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{monthLabel}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">{cells}</div>
        {isLoading && (
          <p className="mt-4 text-center text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    </div>
  );
}
