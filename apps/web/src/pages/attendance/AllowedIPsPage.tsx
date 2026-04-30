import { useState, type ReactElement } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAllowedIPs,
  useCreateAllowedIP,
  useDeleteAllowedIP,
} from '@/hooks/use-attendance';
import type { AllowedIP } from '@/lib/attendance.api';

export default function AllowedIPsPage(): ReactElement {
  const { data, isLoading } = useAllowedIPs({ limit: 100 });
  const create = useCreateAllowedIP();
  const remove = useDeleteAllowedIP();

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const submit = (): void => {
    create.mutate(
      {
        label,
        ipAddress: ipAddress || undefined,
        ipRangeStart: rangeStart || undefined,
        ipRangeEnd: rangeEnd || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setLabel('');
          setIpAddress('');
          setRangeStart('');
          setRangeEnd('');
        },
      },
    );
  };

  const columns: DataTableColumn<AllowedIP>[] = [
    { key: 'label', header: 'Label', cell: (r) => <span className="font-medium">{r.label}</span> },
    {
      key: 'ip',
      header: 'IP / Range',
      cell: (r) =>
        r.ipAddress ? (
          <span className="font-mono text-xs">{r.ipAddress}</span>
        ) : (
          <span className="font-mono text-xs">
            {r.ipRangeStart} → {r.ipRangeEnd}
          </span>
        ),
    },
    {
      key: 'active',
      header: 'Status',
      cell: (r) => <Badge variant={r.isActive ? 'success' : 'secondary'}>{r.isActive ? 'Active' : 'Off'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (r) => (
        <button
          onClick={() => remove.mutate(r._id)}
          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allowed IPs"
        description="Restrict check-in to office network IPs"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'Allowed IPs' },
        ]}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" />
            New IP
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No IPs configured"
        emptyDescription="Add allowed IPs to enable IP-restricted check-in"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>New allowed IP</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="ip-label">Label *</Label>
            <Input id="ip-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ip-addr">Single IP</Label>
            <Input
              id="ip-addr"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="203.0.113.42"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">— or —</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ip-start">Range start</Label>
              <Input id="ip-start" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ip-end">Range end</Label>
              <Input id="ip-end" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending}
            disabled={!label || (!ipAddress && (!rangeStart || !rangeEnd))}
          >
            Add
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
