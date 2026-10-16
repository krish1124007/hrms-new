import { useMemo, useState, type ReactElement } from 'react';
import { LogIn, LogOut, MapPin, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useFieldVisits,
  useTodayVisits,
  useFieldClients,
  useCheckIn,
  useCheckOut,
  useDeleteVisit,
} from '@/hooks/use-field';
import type { FieldVisit, VisitOutcome, VisitPurpose } from '@/lib/field.api';

function clientLabel(v: FieldVisit): string {
  return typeof v.clientId === 'object' ? v.clientId.name : '—';
}

function employeeLabel(v: FieldVisit): string {
  if (typeof v.employeeId === 'object') {
    return `${v.employeeId.firstName} ${v.employeeId.lastName}`;
  }
  return '';
}

export default function VisitsPage(): ReactElement {
  const { data: today } = useTodayVisits();
  const { data: visits, isLoading } = useFieldVisits();
  const { data: clientsData } = useFieldClients({ limit: 200 });
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const remove = useDeleteVisit();

  const clients = clientsData?.data ?? [];

  const [openCheckin, setOpenCheckin] = useState(false);
  const [checkinClient, setCheckinClient] = useState('');
  const [checkinPurpose, setCheckinPurpose] = useState<VisitPurpose>('sales');

  const [openCheckout, setOpenCheckout] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VisitOutcome>('positive');
  const [notes, setNotes] = useState('');

  const inProgress = useMemo(
    () => (today?.data ?? []).filter((v) => v.status === 'in_progress'),
    [today],
  );

  const submitCheckin = (): void => {
    if (!checkinClient) return;
    checkIn.mutate(
      {
        clientId: checkinClient,
        purpose: checkinPurpose,
        checkIn: { time: new Date().toISOString() },
      },
      {
        onSuccess: () => {
          setOpenCheckin(false);
          setCheckinClient('');
        },
      },
    );
  };

  const submitCheckout = (): void => {
    if (!openCheckout) return;
    checkOut.mutate(
      {
        id: openCheckout,
        input: {
          checkOut: { time: new Date().toISOString() },
          outcome,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          setOpenCheckout(null);
          setNotes('');
        },
      },
    );
  };

  const columns: DataTableColumn<FieldVisit>[] = [
    {
      key: 'client',
      header: 'Client',
      cell: (r) => (
        <div>
          <div className="font-medium">{clientLabel(r)}</div>
          <div className="text-xs text-muted-foreground">{employeeLabel(r)}</div>
        </div>
      ),
    },
    {
      key: 'purpose',
      header: 'Purpose',
      cell: (r) => <span className="text-xs capitalize">{r.purpose}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge
          variant={
            r.status === 'completed'
              ? 'success'
              : r.status === 'in_progress'
                ? 'warning'
                : 'secondary'
          }
        >
          {r.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'checkin',
      header: 'Check-in',
      cell: (r) =>
        r.checkIn?.time
          ? new Date(r.checkIn.time).toLocaleString([], {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: 'short',
            })
          : '—',
    },
    {
      key: 'duration',
      header: 'Duration',
      cell: (r) => (r.duration ? `${r.duration} min` : '—'),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (r) => r.outcome ?? '—',
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.status === 'in_progress' && (
            <button
              onClick={() => setOpenCheckout(r._id)}
              className="rounded p-1.5 text-warning hover:bg-warning/10"
              title="Check out"
            >
              <LogOut className="size-4" />
            </button>
          )}
          <button
            onClick={() => remove.mutate(r._id)}
            className="rounded p-1.5 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visits"
        description="Field visits and check-ins"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Visits' },
        ]}
        actions={
          <Button onClick={() => setOpenCheckin(true)}>
            <LogIn className="mr-2 size-4" />
            Check In
          </Button>
        }
      />

      {inProgress.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4 text-warning" />
              In Progress ({inProgress.length})
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {inProgress.map((v) => (
                <div
                  key={v._id}
                  className="flex items-center justify-between rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{clientLabel(v)}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.checkIn?.time
                        ? `Started ${new Date(v.checkIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setOpenCheckout(v._id)}>
                    Check out
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={visits?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No visits yet"
      />

      <Dialog open={openCheckin} onClose={() => setOpenCheckin(false)} size="md">
        <DialogHeader>
          <DialogTitle>Check in to client</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="client">Client</Label>
            <Select
              id="client"
              value={checkinClient}
              onChange={(e) => setCheckinClient(e.target.value)}
            >
              <option value="">— Select —</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} {c.company ? `(${c.company})` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="purpose">Purpose</Label>
            <Select
              id="purpose"
              value={checkinPurpose}
              onChange={(e) => setCheckinPurpose(e.target.value as VisitPurpose)}
            >
              <option value="sales">Sales</option>
              <option value="service">Service</option>
              <option value="collection">Collection</option>
              <option value="followup">Follow-up</option>
              <option value="other">Other</option>
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenCheckin(false)}>
            Cancel
          </Button>
          <Button
            onClick={submitCheckin}
            disabled={!checkinClient}
            loading={checkIn.isPending}
          >
            <LogIn className="mr-2 size-4" />
            Check In
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={openCheckout !== null}
        onClose={() => setOpenCheckout(null)}
        size="md"
      >
        <DialogHeader>
          <DialogTitle>Check out</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="outcome">Outcome</Label>
            <Select
              id="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as VisitOutcome)}
            >
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
              <option value="followup_required">Follow-up required</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened?"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenCheckout(null)}>
            Cancel
          </Button>
          <Button onClick={submitCheckout} loading={checkOut.isPending}>
            <LogOut className="mr-2 size-4" />
            Check Out
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
