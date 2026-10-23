import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus, Pencil, Plus, Repeat, Trash2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowActionsMenu, type RowAction } from '@/components/common/RowActionsMenu';
import { CancelVisitDialog } from '@/components/field/CancelVisitDialog';
import { EmployeeSelect } from '@/components/field/EmployeeSelect';
import { PlanVisitDialog } from '@/components/field/PlanVisitDialog';
import { ScheduleRuleEditor } from '@/components/field/ScheduleRuleEditor';
import { SitePicker } from '@/components/field/SitePicker';
import {
  useCanPickEmployees,
  useCreateSchedule,
  useDeleteSchedule,
  useFieldReps,
  useFieldSettings,
  useMyEmployeeId,
  useUpdateSchedule,
  useVisits,
  useVisitSchedules,
} from '@/hooks/use-field';
import { addDaysToKey } from '@/lib/business-day';
import {
  personName,
  refId,
  type FieldEmployeeRef,
  type Visit,
  type VisitSchedule,
  type VisitScheduleInput,
} from '@/lib/field.api';
import {
  buildRule,
  describeRule,
  describeRuleSpan,
  draftFromRule,
  emptyRuleDraft,
  ruleError,
  type RuleDraft,
} from '@/lib/field-schedule';
import { formatDate, todayIST } from '@/lib/format';
import { FieldTasksPanel } from './FieldTasksPage';

const TABS = ['planned', 'recurring', 'tasks'] as const;
type Tab = (typeof TABS)[number];

/* ── Planned visits ── */

function PlannedVisits(): ReactElement {
  const navigate = useNavigate();
  const today = todayIST();
  const canPick = useCanPickEmployees();
  const { data: people = [] } = useFieldReps(canPick);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDaysToKey(today, 13));
  const [employeeId, setEmployeeId] = useState('');
  const [page, setPage] = useState(1);
  const [planning, setPlanning] = useState(false);
  const [cancelling, setCancelling] = useState<Visit | null>(null);
  const { data, isLoading, error, refetch } = useVisits({
    status: 'planned',
    from,
    to,
    employeeId: employeeId || undefined,
    page,
    limit: 20,
  });

  const columns: DataTableColumn<Visit>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (v) => <span className="whitespace-nowrap text-xs font-medium">{v.plannedDate ? formatDate(v.plannedDate) : '—'}</span>,
    },
    { key: 'employee', header: 'Employee', cell: (v) => <span className="text-xs">{personName(v.employee)}</span> },
    {
      key: 'site',
      header: 'Site',
      cell: (v) => (
        <div className="text-xs">
          <div className="font-medium">{v.site?.name ?? '—'}</div>
          {v.notes && <div className="line-clamp-1 text-muted-foreground">{v.notes}</div>}
        </div>
      ),
    },
    { key: 'purpose', header: 'Purpose', cell: (v) => <span className="text-xs">{v.purpose}</span> },
    {
      key: 'source',
      header: 'Source',
      cell: (v) => <span className="text-xs text-muted-foreground">{v.scheduleId ? 'Recurring' : 'One-off'}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '56px',
      cell: (v) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu
            label={`Actions for the visit to ${v.site?.name ?? 'the site'}`}
            actions={[{ label: 'Cancel visit', icon: XCircle, destructive: true, onSelect: () => setCancelling(v) }]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="planned-from">From</Label>
          <Input
            id="planned-from"
            type="date"
            className="w-40"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value || today);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="planned-to">To</Label>
          <Input
            id="planned-to"
            type="date"
            className="w-40"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value || from);
              setPage(1);
            }}
          />
        </div>
        {canPick && (
          <div className="space-y-1.5">
            <Label htmlFor="planned-employee">Employee</Label>
            <Select
              id="planned-employee"
              className="w-52"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Everyone I can see</option>
              {people.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Button className="ml-auto" onClick={() => setPlanning(true)}>
          <CalendarPlus className="size-4" />
          Plan a visit
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(v) => v._id}
        onRowClick={(v) => navigate(`/field/visits/${v._id}`)}
        emptyTitle="Nothing planned"
        emptyDescription="Plan a visit, or set up a recurring one — its visits appear here up to 7 days ahead."
      />
      <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />
      <PlanVisitDialog open={planning} onClose={() => setPlanning(false)} />
      <CancelVisitDialog visit={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}

/* ── Recurring visits ── */

const scheduleSite = (s: VisitSchedule): { _id: string; name: string } | null => {
  const site = s.site ?? (typeof s.siteId === 'object' ? s.siteId : null);
  return site ? { _id: site._id, name: site.name } : null;
};
const scheduleEmployee = (s: VisitSchedule): FieldEmployeeRef | null =>
  s.employee ?? (typeof s.employeeId === 'object' ? s.employeeId : null);

interface ScheduleForm {
  siteId: string;
  siteName: string;
  employeeId: string;
  purpose: string;
  rule: RuleDraft;
}

function ScheduleDialog({ schedule, open, onClose }: { schedule: VisitSchedule | null; open: boolean; onClose: () => void }): ReactElement {
  const { settings } = useFieldSettings();
  const myEmployeeId = useMyEmployeeId();
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const blank = (): ScheduleForm =>
    schedule
      ? {
          siteId: refId(schedule.siteId),
          siteName: scheduleSite(schedule)?.name ?? '',
          employeeId: refId(schedule.employeeId),
          purpose: schedule.purpose,
          rule: draftFromRule(schedule.rule),
        }
      : { siteId: '', siteName: '', employeeId: '', purpose: '', rule: emptyRuleDraft(addDaysToKey(todayIST(), 1)) };
  const [form, setForm] = useState<ScheduleForm>(blank);
  useEffect(() => {
    if (open) setForm(blank());
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedule?._id]);

  // The API needs the employee spelled out; "Myself" is the signed-in employee.
  const employeeId = form.employeeId || myEmployeeId || '';
  const error = ruleError(form.rule);
  const valid = !!form.siteId && !!employeeId && !!form.purpose && !error;

  const submit = (): void => {
    if (!valid) return;
    const rule = buildRule(form.rule);
    if (!schedule) {
      create.mutate({ siteId: form.siteId, employeeId, purpose: form.purpose, rule }, { onSuccess: onClose });
      return;
    }
    // Only what changed: an untouched purpose HR has since renamed or removed
    // would be refused, and so would the whole edit.
    const input: Partial<VisitScheduleInput> = {};
    if (form.siteId !== refId(schedule.siteId)) input.siteId = form.siteId;
    if (employeeId !== refId(schedule.employeeId)) input.employeeId = employeeId;
    if (form.purpose !== schedule.purpose) input.purpose = form.purpose;
    if (JSON.stringify(rule) !== JSON.stringify(buildRule(draftFromRule(schedule.rule)))) input.rule = rule;
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: schedule._id, input }, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>{schedule ? 'Edit recurring visit' : 'New recurring visit'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[75vh] space-y-3 overflow-y-auto">
        <SitePicker
          id="schedule-site"
          required
          value={form.siteId}
          selectedLabel={form.siteName}
          onChange={(siteId, siteName) => setForm((f) => ({ ...f, siteId, siteName }))}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <EmployeeSelect
            id="schedule-employee"
            label="Visit by"
            value={form.employeeId}
            current={schedule ? scheduleEmployee(schedule) : null}
            onChange={(id) => setForm((f) => ({ ...f, employeeId: id }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="schedule-purpose">Purpose *</Label>
            <Select
              id="schedule-purpose"
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
            >
              <option value="">— Select —</option>
              {form.purpose && !settings.visitPurposes.includes(form.purpose) && (
                <option value={form.purpose}>{form.purpose}</option>
              )}
              {settings.visitPurposes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ScheduleRuleEditor value={form.rule} onChange={(rule) => setForm((f) => ({ ...f, rule }))} />
        <p className="text-xs text-muted-foreground">
          Each night the next 7 days of visits are planned from this rule. After a change, visits from tomorrow on follow
          the new rule; today’s visit stays as it is.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid} loading={create.isPending || update.isPending}>
          {schedule ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function RecurringVisits(): ReactElement {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useVisitSchedules({ page, limit: 20 });
  const remove = useDeleteSchedule();
  const [editing, setEditing] = useState<VisitSchedule | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<VisitSchedule | null>(null);

  const columns: DataTableColumn<VisitSchedule>[] = [
    { key: 'site', header: 'Site', cell: (s) => <span className="text-xs font-medium">{scheduleSite(s)?.name ?? '—'}</span> },
    { key: 'employee', header: 'Employee', cell: (s) => <span className="text-xs">{personName(scheduleEmployee(s))}</span> },
    { key: 'purpose', header: 'Purpose', cell: (s) => <span className="text-xs">{s.purpose}</span> },
    {
      key: 'rule',
      header: 'When',
      cell: (s) => (
        <div className="text-xs">
          <div className="font-medium">{describeRule(s.rule)}</div>
          <div className="text-muted-foreground">{describeRuleSpan(s.rule)}</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '56px',
      cell: (s) => {
        const actions: RowAction[] = [
          {
            label: 'Edit',
            icon: Pencil,
            onSelect: () => {
              setEditing(s);
              setOpen(true);
            },
          },
          { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setDeleting(s) },
        ];
        return (
          <div className="flex justify-end">
            <RowActionsMenu actions={actions} label={`Actions for the recurring visit to ${scheduleSite(s)?.name ?? 'the site'}`} />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          A recurring visit plans itself — every week on chosen days, or once a month.
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          New recurring visit
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(s) => s._id}
        emptyTitle="No recurring visits"
        emptyDescription="Set one up for regular work, e.g. a weekly inspection at a site."
      />
      <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />
      <ScheduleDialog schedule={editing} open={open} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting._id, { onSuccess: () => setDeleting(null) })}
        loading={remove.isPending}
        title="Delete this recurring visit?"
        description="No more visits are planned from it. Its planned visits from tomorrow on are removed; today’s stays."
        confirmLabel="Delete"
      />
    </div>
  );
}

/** Planning: one-off planned visits, recurring visits, and tasks at sites. */
export default function PlanningPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'planned';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning"
        description="Plan visits for yourself and your team, set up recurring visits and assign tasks at sites"
        icon={CalendarClock}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Planning' }]}
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === 'planned') next.delete('tab');
          else next.set('tab', v);
          setParams(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="planned">
            <CalendarPlus className="mr-1.5 size-4" />
            Planned visits
          </TabsTrigger>
          <TabsTrigger value="recurring">
            <Repeat className="mr-1.5 size-4" />
            Recurring visits
          </TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="planned">
          <PlannedVisits />
        </TabsContent>
        <TabsContent value="recurring">
          <RecurringVisits />
        </TabsContent>
        <TabsContent value="tasks">
          <FieldTasksPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
