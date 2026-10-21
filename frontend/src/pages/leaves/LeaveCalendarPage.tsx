import { useState, type ReactElement } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useLeaveCalendar } from '@/hooks/use-leaves';
import { cn } from '@/lib/utils';
import { DEFAULT_WEEK_OFF_RULE, isWeekOff } from '@/lib/week-off';
import { useAttendanceConfig } from '@/hooks/use-attendance';
import { todayIST, toISTDateKey } from '@/lib/format';
import { apiErrorMessage } from '@/lib/api-error';
import { addDaysToKey, dayKeyOf, monthBoundsIST, partsOfKey } from '@/lib/business-day';

/** The month shown: `{ year, month (1-12) }` on the IST calendar. */
function currentMonthIST(): { year: number; month: number } {
  const { year, month } = partsOfKey(todayIST());
  return { year, month };
}

export default function LeaveCalendarPage(): ReactElement {
  const [cursor, setCursor] = useState(currentMonthIST);
  const shift = (delta: number): void =>
    setCursor(({ year, month }) => {
      const m = year * 12 + (month - 1) + delta;
      return { year: Math.floor(m / 12), month: (m % 12) + 1 };
    });

  // The whole month in IST: from 00:00 IST on the 1st to the end of the last
  // day — the last day's leaves included.
  const bounds = monthBoundsIST(cursor.year, cursor.month);
  const { data, isLoading, error } = useLeaveCalendar(bounds.from.toISOString(), bounds.to.toISOString());

  const { data: configData } = useAttendanceConfig();
  const weekOffRule = configData?.data.weekOff ?? DEFAULT_WEEK_OFF_RULE;

  const daysInMonth = partsOfKey(bounds.lastKey).day;
  const firstDow = new Date(cursor.year, cursor.month - 1, 1).getDay();

  // Day key (IST `YYYY-MM-DD`) -> the leaves on it. Keys come from the IST day
  // of each stored date, so a leave never shows a day early or late.
  const byDay: Record<string, { name: string; color: string; pending: boolean }[]> = {};
  (data?.data ?? []).forEach((r) => {
    const startKey = toISTDateKey(r.startDate);
    const endKey = toISTDateKey(r.endDate);
    let key = startKey > bounds.firstKey ? startKey : bounds.firstKey;
    const stop = endKey < bounds.lastKey ? endKey : bounds.lastKey;
    const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
    const lt = typeof r.leaveTypeId === 'object' ? r.leaveTypeId : null;
    while (key <= stop) {
      byDay[key] ??= [];
      byDay[key].push({
        name: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
        color: lt?.color ?? '#3b82f6',
        pending: r.status === 'pending',
      });
      key = addDaysToKey(key, 1);
    }
  });

  const monthLabel = new Date(cursor.year, cursor.month - 1, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const cells: ReactElement[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`pad-${i}`} className="aspect-square" />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    // A local Date of that calendar day only for its weekday (week-off rule).
    const date = new Date(cursor.year, cursor.month - 1, d);
    const key = dayKeyOf(cursor.year, cursor.month, d);
    const list = byDay[key] ?? [];
    const weekOff = isWeekOff(date, weekOffRule);
    cells.push(
      <div
        key={key}
        aria-label={`${d} ${monthLabel}${list.length ? `: ${list.length} on leave` : ''}`}
        className={cn(
          'flex aspect-square flex-col rounded-md border border-border p-1.5 text-xs',
          weekOff ? 'bg-muted/30' : 'bg-card',
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
            onClick={() => shift(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(currentMonthIST())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => shift(1)}
            aria-label="Next month"
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
        {error && (
          <p className="mt-4 text-center text-sm text-destructive">
            Couldn't load leaves for this month: {apiErrorMessage(error)}
          </p>
        )}
      </div>
    </div>
  );
}
