import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, LogIn, LogOut, MapPin, Route, Trash2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowActionsMenu, type RowAction } from '@/components/common/RowActionsMenu';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { ClientPicker } from '@/components/field/ClientPicker';
import { LocationCapture } from '@/components/field/LocationCapture';
import {
  LocationMismatchBadge,
  LocationMissingBadge,
  PhotoInput,
  PhotoStrip,
  VisitStatusBadge,
} from '@/components/field/FieldBits';
import { RepSelect } from '@/components/field/RepSelect';
import { VisitPinsMap } from '@/components/field/VisitPinsMap';
import {
  useCancelVisit,
  useCanManageField,
  useCheckIn,
  useCheckOut,
  useCreateVisit,
  useDeleteVisit,
  useFieldReps,
  useFieldVisits,
  useMyEmployeeId,
  useTodayVisits,
  useVisitsMap,
  useRepSelectRequired,
} from '@/hooks/use-field';
import type { BrowserFix } from '@/hooks/use-browser-location';
import { usePermissions } from '@/hooks/use-permissions';
import { isNoEmployeeProfileError } from '@/lib/api-error';
import { addDaysToKey } from '@/lib/business-day';
import { personName, refId, type FieldVisit, type VisitOutcome, type VisitPurpose } from '@/lib/field.api';
import { formatDate, formatDateTime, formatTime, toISTDateKey, todayIST } from '@/lib/format';

const PURPOSES: Array<{ value: VisitPurpose; label: string }> = [
  { value: 'sales', label: 'Sales' },
  { value: 'service', label: 'Service' },
  { value: 'collection', label: 'Collection' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'other', label: 'Other' },
];
const OUTCOMES: Array<{ value: VisitOutcome; label: string }> = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'followup_required', label: 'Follow-up required' },
];
const purposeLabel = (p: string): string => PURPOSES.find((x) => x.value === p)?.label ?? p;
const outcomeLabel = (o?: string): string => (o ? (OUTCOMES.find((x) => x.value === o)?.label ?? o) : '—');

const clientName = (v: FieldVisit): string => (typeof v.clientId === 'object' ? v.clientId.name : '—');

/** Every photo of a visit: check-in, check-out, then the rest. */
function visitPhotos(v: FieldVisit): string[] {
  return [v.checkIn?.photo, v.checkOut?.photo, ...(v.photos ?? [])].filter((u): u is string => !!u);
}

/* ── Check in ── */

function CheckInDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const [clientId, setClientId] = useState('');
  const [clientLabel, setClientLabel] = useState('');
  const [purpose, setPurpose] = useState<VisitPurpose>('sales');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState('');
  const [fix, setFix] = useState<BrowserFix | undefined>();
  const [locating, setLocating] = useState(false);
  const [plannedId, setPlannedId] = useState('');
  const { data: today } = useTodayVisits();
  const checkIn = useCheckIn();
  const onFix = useCallback((f: BrowserFix | undefined) => setFix(f), []);

  const planned = (today?.data ?? []).filter((v) => v.status === 'scheduled' && refId(v.clientId) === clientId);

  const reset = (): void => {
    setClientId('');
    setClientLabel('');
    setPurpose('sales');
    setNotes('');
    setPhoto('');
    setPlannedId('');
  };
  // Closing (Cancel, Esc, success) always starts the next check-in clean.
  const close = (): void => {
    if (checkIn.isPending) return;
    reset();
    onClose();
  };

  const submit = (): void => {
    // Wait for the GPS fix: checking in without one flags the visit.
    if (!clientId || locating) return;
    checkIn.mutate(
      {
        clientId,
        visitId: plannedId || undefined,
        purpose,
        notes: notes.trim() || undefined,
        checkIn: {
          location: fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : undefined,
          photo: photo || undefined,
        },
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={close} size="lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <LogIn className="size-4" />
          Check in at a client
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[75vh] space-y-3 overflow-y-auto">
        <ClientPicker
          value={clientId}
          selectedLabel={clientLabel}
          onChange={(id, name) => {
            setClientId(id);
            setClientLabel(name);
            setPlannedId('');
          }}
          required
        />
        {planned.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="ci-planned">Planned visit</Label>
            <Select id="ci-planned" value={plannedId} onChange={(e) => setPlannedId(e.target.value)}>
              <option value="">Start a new visit</option>
              {planned.map((v) => (
                <option key={v._id} value={v._id}>
                  Planned {purposeLabel(v.purpose).toLowerCase()} visit ({formatTime(v.createdAt)})
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ci-purpose">Purpose</Label>
          <Select id="ci-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as VisitPurpose)}>
            {PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        {open && <LocationCapture onFix={onFix} onLocating={setLocating} />}
        <PhotoInput value={photo} onChange={setPhoto} label="Photo (optional)" />
        <div className="space-y-1.5">
          <Label htmlFor="ci-notes">Notes</Label>
          <Textarea id="ci-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={checkIn.isPending}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={!clientId || locating}
          loading={checkIn.isPending}
          title={locating ? 'Waiting for your location…' : undefined}
        >
          <LogIn className="mr-2 size-4" />
          {locating ? 'Locating…' : 'Check in'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Check out ── */

function CheckOutDialog({ visit, onClose }: { visit: FieldVisit | null; onClose: () => void }): ReactElement {
  const [outcome, setOutcome] = useState<VisitOutcome>('positive');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [photo, setPhoto] = useState('');
  const [fix, setFix] = useState<BrowserFix | undefined>();
  const [locating, setLocating] = useState(false);
  const checkOut = useCheckOut();
  const onFix = useCallback((f: BrowserFix | undefined) => setFix(f), []);

  const reset = (): void => {
    setOutcome('positive');
    setNotes('');
    setFollowUp('');
    setPhoto('');
  };
  const close = (): void => {
    if (checkOut.isPending) return;
    reset();
    onClose();
  };

  const submit = (): void => {
    if (!visit || locating) return;
    checkOut.mutate(
      {
        id: visit._id,
        input: {
          checkOut: {
            location: fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : undefined,
            photo: photo || undefined,
          },
          outcome,
          notes: notes.trim() || undefined,
          nextFollowUpDate: followUp || undefined,
        },
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={visit !== null} onClose={close} size="md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <LogOut className="size-4" />
          Check out{visit ? ` — ${clientName(visit)}` : ''}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[75vh] space-y-3 overflow-y-auto">
        <div className="space-y-1.5">
          <Label htmlFor="co-outcome">Outcome</Label>
          <Select id="co-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as VisitOutcome)}>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {visit && <LocationCapture onFix={onFix} onLocating={setLocating} />}
        <PhotoInput value={photo} onChange={setPhoto} label="Photo (optional)" />
        <div className="space-y-1.5">
          <Label htmlFor="co-notes">Notes</Label>
          <Textarea id="co-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened?" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-follow">Next follow-up</Label>
          <Input id="co-follow" type="date" min={todayIST()} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={checkOut.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={locating} loading={checkOut.isPending}>
          <LogOut className="mr-2 size-4" />
          {locating ? 'Locating…' : 'Check out'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Plan ── */

function PlanVisitDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const [clientId, setClientId] = useState('');
  const [clientLabel, setClientLabel] = useState('');
  const [purpose, setPurpose] = useState<VisitPurpose>('sales');
  const [notes, setNotes] = useState('');
  const [repId, setRepId] = useState('');
  const repRequired = useRepSelectRequired();
  const create = useCreateVisit();

  const submit = (): void => {
    if (!clientId || (repRequired && !repId)) return;
    create.mutate(
      { clientId, purpose, notes: notes.trim() || undefined, employeeId: repId || undefined },
      {
        onSuccess: () => {
          setClientId('');
          setClientLabel('');
          setNotes('');
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarPlus className="size-4" />
          Plan a visit
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <ClientPicker
          value={clientId}
          selectedLabel={clientLabel}
          onChange={(id, name) => {
            setClientId(id);
            setClientLabel(name);
          }}
          required
        />
        <RepSelect value={repId} onChange={setRepId} label="Visit by" />
        <div className="space-y-1.5">
          <Label htmlFor="pv-purpose">Purpose</Label>
          <Select id="pv-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as VisitPurpose)}>
            {PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pv-notes">Notes</Label>
          <Textarea id="pv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">A planned visit starts when the rep checks in at the client.</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!clientId || (repRequired && !repId)} loading={create.isPending}>
          Plan visit
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Map tab ── */

function VisitsMapTab(): ReactElement {
  const canManage = useCanManageField();
  const { has } = usePermissions();
  const canPick = canManage && has('employees.view');
  const { data: reps = [] } = useFieldReps(canPick);
  const today = todayIST();
  const [date, setDate] = useState(today);
  const [rep, setRep] = useState('');
  const { data, isLoading, error } = useVisitsMap({ date, employeeId: rep || undefined });
  const pins = data?.data ?? [];
  const unplaced = pins.filter((p) => p.lat == null || p.lng == null).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="vm-date">Day (IST)</Label>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setDate(addDaysToKey(date, -1))} aria-label="Previous day">
              ‹
            </Button>
            <Input id="vm-date" type="date" className="w-40" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDate(addDaysToKey(date, 1))}
              disabled={date >= today}
              aria-label="Next day"
            >
              ›
            </Button>
          </div>
        </div>
        {canPick && (
          <div className="min-w-[200px] space-y-1.5">
            <Label htmlFor="vm-rep">Rep</Label>
            <Select id="vm-rep" value={rep} onChange={(e) => setRep(e.target.value)}>
              <option value="">Everyone</option>
              {reps.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.firstName} {r.lastName}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="pb-2 text-sm text-muted-foreground">
          {pins.length} {pins.length === 1 ? 'visit' : 'visits'}
          {unplaced ? ` (${unplaced} without a location)` : ''}
          {data?.truncated ? ' — showing the first 1,000' : ''}
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-[480px] w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load the visits map.</p>
      ) : (
        <VisitPinsMap pins={pins} date={date} />
      )}
    </div>
  );
}

/* ── Page ── */

export default function VisitsPage(): ReactElement {
  const canManage = useCanManageField();
  const myEmployeeId = useMyEmployeeId();
  const { has } = usePermissions();
  const canPickRep = canManage && has('employees.view');
  const { data: reps = [] } = useFieldReps(canPickRep);
  const [tab, setTab] = useState('list');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [purpose, setPurpose] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rep, setRep] = useState('');

  const { data: today } = useTodayVisits();
  const { data: visits, isLoading, error, refetch } = useFieldVisits({
    page,
    limit: 20,
    status: status || undefined,
    purpose: purpose || undefined,
    from: from || undefined,
    to: to || undefined,
    employeeId: rep || undefined,
    sort: '-createdAt',
  });
  const cancel = useCancelVisit();
  const remove = useDeleteVisit();

  const [checkingIn, setCheckingIn] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [checkingOut, setCheckingOut] = useState<FieldVisit | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; v: FieldVisit } | null>(null);

  const inProgress = useMemo(() => (today?.data ?? []).filter((v) => v.status === 'in_progress'), [today]);
  const isMine = (v: FieldVisit): boolean => !!myEmployeeId && refId(v.employeeId) === myEmployeeId;

  const columns: DataTableColumn<FieldVisit>[] = [
    {
      key: 'client',
      header: 'Client',
      cell: (r) => (
        <div>
          <div className="font-medium">{clientName(r)}</div>
          <div className="text-xs text-muted-foreground">{personName(r.employeeId)}</div>
        </div>
      ),
    },
    { key: 'purpose', header: 'Purpose', cell: (r) => <span className="text-xs">{purposeLabel(r.purpose)}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <VisitStatusBadge status={r.status} />
          {r.locationMismatch && <LocationMismatchBadge distanceM={r.distanceFromClientM} />}
          {r.locationMissing && <LocationMissingBadge />}
        </div>
      ),
    },
    {
      key: 'checkin',
      header: 'Check-in',
      cell: (r) => (
        <div className="text-xs">
          <div>{r.checkIn?.time ? formatDateTime(r.checkIn.time) : `Planned ${formatDate(r.createdAt)}`}</div>
          {r.checkIn?.time && !r.locationMismatch && r.distanceFromClientM != null && (
            <div className="text-muted-foreground">{Math.round(r.distanceFromClientM)} m from client</div>
          )}
          {r.checkIn?.time && !r.checkIn.location && !r.locationMissing && (
            <div className="text-muted-foreground">No GPS fix</div>
          )}
        </div>
      ),
    },
    { key: 'duration', header: 'Duration', cell: (r) => <span className="text-xs">{r.duration != null ? `${r.duration} min` : '—'}</span> },
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (r) => (
        <div className="max-w-[220px] space-y-0.5 text-xs">
          <div>{outcomeLabel(r.outcome)}</div>
          {r.notes && (
            <div className="line-clamp-2 text-muted-foreground" title={r.notes}>
              <span className="font-medium text-foreground/80">In:</span> {r.notes}
            </div>
          )}
          {r.checkOut?.notes && (
            <div className="line-clamp-2 text-muted-foreground" title={r.checkOut.notes}>
              <span className="font-medium text-foreground/80">Out:</span> {r.checkOut.notes}
            </div>
          )}
        </div>
      ),
    },
    { key: 'photos', header: 'Photos', cell: (r) => <PhotoStrip urls={visitPhotos(r)} size={36} /> },
    {
      key: 'actions',
      header: '',
      width: '110px',
      cell: (r) => {
        const owner = isMine(r) || canManage;
        const menu: RowAction[] = [];
        if (owner && (r.status === 'scheduled' || r.status === 'in_progress')) {
          menu.push({ label: 'Cancel visit', icon: XCircle, onSelect: () => setConfirm({ kind: 'cancel', v: r }), destructive: true });
        }
        if (canManage) menu.push({ label: 'Delete', icon: Trash2, onSelect: () => setConfirm({ kind: 'delete', v: r }), destructive: true });
        const day = r.checkIn?.time ? toISTDateKey(r.checkIn.time) : null;
        return (
          <div className="flex items-center justify-end gap-1">
            {r.status === 'in_progress' && owner && (
              <button
                onClick={() => setCheckingOut(r)}
                className="rounded p-1.5 text-warning hover:bg-warning/10"
                title="Check out"
                aria-label={`Check out of ${clientName(r)}`}
              >
                <LogOut className="size-4" />
              </button>
            )}
            {day && (
              <Link
                to={`/field/trail?employeeId=${encodeURIComponent(refId(r.employeeId))}&date=${day}`}
                className="rounded p-1.5 text-primary hover:bg-primary/10"
                title="Trail for that day"
                aria-label={`Trail for ${clientName(r)} visit`}
              >
                <Route className="size-4" />
              </Link>
            )}
            {menu.length > 0 && <RowActionsMenu actions={menu} />}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visits"
        description="Client visits — check-ins are compared with the client's location and flagged when far away"
        icon={MapPin}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Visits' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPlanning(true)}>
              <CalendarPlus className="mr-2 size-4" />
              Plan visit
            </Button>
            <Button onClick={() => setCheckingIn(true)}>
              <LogIn className="mr-2 size-4" />
              Check in
            </Button>
          </div>
        }
      />

      {inProgress.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4 text-warning" />
              In progress ({inProgress.length})
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {inProgress.map((v) => (
                <div
                  key={v._id}
                  className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{clientName(v)}</div>
                    <div className="text-xs text-muted-foreground">
                      {personName(v.employeeId) !== '—' ? `${personName(v.employeeId)} · ` : ''}
                      {v.checkIn?.time ? `since ${formatTime(v.checkIn.time)}` : ''}
                    </div>
                    {v.locationMismatch && <LocationMismatchBadge distanceM={v.distanceFromClientM} />}
                    {v.locationMissing && <LocationMissingBadge />}
                  </div>
                  {(isMine(v) || canManage) && (
                    <Button size="sm" onClick={() => setCheckingOut(v)}>
                      Check out
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
              <option value="">All statuses</option>
              <option value="scheduled">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select aria-label="Purpose" value={purpose} onChange={(e) => { setPurpose(e.target.value); setPage(1); }} className="w-40">
              <option value="">All purposes</option>
              {PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            {canPickRep && (
              <Select aria-label="Rep" value={rep} onChange={(e) => { setRep(e.target.value); setPage(1); }} className="w-48">
                <option value="">All reps</option>
                {reps.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.firstName} {r.lastName}
                  </option>
                ))}
              </Select>
            )}
            <div className="flex items-center gap-1 text-sm">
              <Input aria-label="From" type="date" className="w-40" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
              <span className="text-muted-foreground">to</span>
              <Input aria-label="To" type="date" className="w-40" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </div>
          </div>
          {isNoEmployeeProfileError(error) ? (
            <NoEmployeeProfileNotice feature="visit history" />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={visits?.data ?? []}
                loading={isLoading}
                error={error}
                onRetry={() => void refetch()}
                rowKey={(r) => r._id}
                emptyTitle="No visits"
                emptyDescription="Check-ins from the mobile app and this page appear here."
              />
              <Pagination page={page} pages={visits?.pagination?.pages ?? 1} onPageChange={setPage} />
            </>
          )}
        </TabsContent>
        <TabsContent value="map">
          <VisitsMapTab />
        </TabsContent>
      </Tabs>

      <CheckInDialog open={checkingIn} onClose={() => setCheckingIn(false)} />
      <CheckOutDialog visit={checkingOut} onClose={() => setCheckingOut(null)} />
      <PlanVisitDialog open={planning} onClose={() => setPlanning(false)} />

      <ConfirmDialog
        open={confirm?.kind === 'cancel'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && cancel.mutate(confirm.v._id, { onSuccess: () => setConfirm(null) })}
        loading={cancel.isPending}
        title={`Cancel the visit to ${confirm ? clientName(confirm.v) : ''}?`}
        description="The visit is closed as cancelled and cannot be checked into again."
        confirmLabel="Cancel visit"
        cancelLabel="Keep visit"
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.v._id, { onSuccess: () => setConfirm(null) })}
        loading={remove.isPending}
        title={`Delete the visit to ${confirm ? clientName(confirm.v) : ''}?`}
        description="The visit and its photos disappear from lists, maps and trails."
        confirmLabel="Delete visit"
      />
    </div>
  );
}
