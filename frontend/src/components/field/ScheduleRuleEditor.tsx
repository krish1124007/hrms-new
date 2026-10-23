import { useId, type ReactElement } from 'react';
import { Repeat } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  buildRule,
  describeRule,
  describeRuleSpan,
  MAX_DAY_OF_MONTH,
  ruleError,
  WEEKDAYS,
  type RuleDraft,
} from '@/lib/field-schedule';
import { cn } from '@/lib/utils';

/**
 * When a recurring visit happens: weekly on chosen weekdays, or monthly on a
 * day of the month, from a first day until an optional last one. Shows the
 * rule in words ("Every Mon and Thu") as it is built.
 */
export function ScheduleRuleEditor({
  value,
  onChange,
}: {
  value: RuleDraft;
  onChange: (next: RuleDraft) => void;
}): ReactElement {
  const id = useId();
  const set = (patch: Partial<RuleDraft>): void => onChange({ ...value, ...patch });
  const toggleDay = (day: number): void =>
    set({
      weekdays: value.weekdays.includes(day) ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day],
    });
  const error = ruleError(value);

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-freq`}>Repeats</Label>
          <Select
            id={`${id}-freq`}
            value={value.freq}
            onChange={(e) => set({ freq: e.target.value as RuleDraft['freq'] })}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>
        {value.freq === 'weekly' ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium" id={`${id}-days`}>
              On
            </span>
            <div className="flex flex-wrap gap-1" role="group" aria-labelledby={`${id}-days`}>
              {WEEKDAYS.map((d) => {
                const on = value.weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      'h-10 w-12 rounded-md border text-sm font-medium transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-dom`}>Day of the month</Label>
            <Input
              id={`${id}-dom`}
              type="number"
              min={1}
              max={MAX_DAY_OF_MONTH}
              className="w-28"
              value={Number.isFinite(value.dayOfMonth) ? String(value.dayOfMonth) : ''}
              onChange={(e) => set({ dayOfMonth: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
            />
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-start`}>Starts on</Label>
          <Input
            id={`${id}-start`}
            type="date"
            value={value.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-end`}>Ends on (optional)</Label>
          <Input
            id={`${id}-end`}
            type="date"
            min={value.startDate || undefined}
            value={value.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
          <Repeat className="size-4" aria-hidden />
          <span>
            {describeRule(buildRule(value))} {describeRuleSpan(buildRule(value))}
          </span>
        </p>
      )}
      {value.freq === 'monthly' && (
        <p className="text-xs text-muted-foreground">
          Days 1–{MAX_DAY_OF_MONTH} only, so the visit falls in every month.
        </p>
      )}
    </div>
  );
}
