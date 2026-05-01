import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  Laptop,
  Calendar,
  ShieldCheck,
  MapPin,
  Hash,
  Package,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAsset,
  useAssignAsset,
  useDeleteAsset,
  useUnassignAsset,
} from '@/hooks/use-assets';
import { useEmployees } from '@/hooks/use-systemcore';
import { ASSET_CATEGORIES, ASSET_CONDITIONS, type AssetCondition, type AssetStatus } from '@/lib/assets.api';
import { formatCurrency, formatDate } from '@/lib/format';

const STATUS_VARIANT: Record<AssetStatus, 'success' | 'default' | 'warning' | 'secondary' | 'destructive'> = {
  available: 'success',
  assigned: 'default',
  maintenance: 'warning',
  retired: 'secondary',
  lost: 'destructive',
};

export default function AssetDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useAsset(id);
  const remove = useDeleteAsset();
  const assign = useAssignAsset();
  const unassign = useUnassignAsset();

  const { data: empData } = useEmployees({ limit: 500 });
  const employees = empData?.data ?? [];

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmpId, setAssignEmpId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [unassignNotes, setUnassignNotes] = useState('');
  const [unassignCondition, setUnassignCondition] = useState<AssetCondition | ''>('');

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const asset = data?.data;
  if (!asset) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Asset not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/assets')}>
          Back to assets
        </Button>
      </div>
    );
  }

  const categoryLabel =
    ASSET_CATEGORIES.find((c) => c.value === asset.category)?.label ?? asset.category;

  const handleDelete = (): void => {
    if (!confirm(`Delete asset "${asset.name}" (${asset.assetCode})? This cannot be undone.`))
      return;
    remove.mutate(asset._id, { onSuccess: () => navigate('/assets') });
  };

  const submitAssign = (): void => {
    if (!assignEmpId) return;
    assign.mutate(
      { id: asset._id, employee: assignEmpId, notes: assignNotes || undefined },
      {
        onSuccess: () => {
          setAssignOpen(false);
          setAssignEmpId('');
          setAssignNotes('');
        },
      },
    );
  };

  const submitUnassign = (): void => {
    unassign.mutate(
      {
        id: asset._id,
        notes: unassignNotes || undefined,
        condition: unassignCondition || undefined,
      },
      {
        onSuccess: () => {
          setUnassignOpen(false);
          setUnassignNotes('');
          setUnassignCondition('');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={asset.name}
        description={asset.assetCode}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Assets', to: '/assets' },
          { label: asset.assetCode },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/assets')}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {asset.assignedTo ? (
              <Button size="sm" variant="outline" onClick={() => setUnassignOpen(true)}>
                <UserMinus className="size-4" /> Unassign
              </Button>
            ) : asset.status === 'available' ? (
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <UserPlus className="size-4" /> Assign
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link to={`/assets/${asset._id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <Laptop className="size-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{asset.name}</h2>
                <p className="text-sm text-muted-foreground">{categoryLabel}</p>
                {asset.manufacturer && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {asset.manufacturer}
                    {asset.modelNumber ? ` · ${asset.modelNumber}` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={STATUS_VARIANT[asset.status]} className="capitalize">
                {asset.status}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {asset.condition}
              </Badge>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailRow icon={Hash} label="Asset code" value={asset.assetCode} mono />
            {asset.serialNumber && (
              <DetailRow icon={Hash} label="Serial number" value={asset.serialNumber} mono />
            )}
            {asset.location && (
              <DetailRow icon={MapPin} label="Location" value={asset.location} />
            )}
            {asset.purchaseDate && (
              <DetailRow
                icon={Calendar}
                label="Purchased on"
                value={formatDate(asset.purchaseDate)}
              />
            )}
            {asset.warrantyExpiresAt && (
              <DetailRow
                icon={ShieldCheck}
                label="Warranty until"
                value={formatDate(asset.warrantyExpiresAt)}
              />
            )}
            {asset.purchasePrice != null && (
              <DetailRow
                icon={Package}
                label="Purchase price"
                value={formatCurrency(asset.purchasePrice)}
              />
            )}
            {asset.currentValue != null && (
              <DetailRow
                icon={Package}
                label="Current value"
                value={formatCurrency(asset.currentValue)}
              />
            )}
          </div>

          {asset.notes && (
            <div className="mt-6 rounded-md bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="whitespace-pre-wrap text-foreground">{asset.notes}</p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-base font-semibold">Currently assigned to</h3>
          {asset.assignedTo ? (
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground">
                  {asset.assignedTo.firstName} {asset.assignedTo.lastName}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {asset.assignedTo.employeeId}
                </p>
                {asset.assignedTo.email && (
                  <p className="mt-1 text-xs text-muted-foreground">{asset.assignedTo.email}</p>
                )}
              </div>
              {asset.assignedAt && (
                <p className="text-xs text-muted-foreground">
                  Assigned {formatDate(asset.assignedAt)}
                </p>
              )}
              <Link
                to={`/employees/${asset.assignedTo._id}`}
                className="inline-block text-xs font-medium text-primary hover:underline"
              >
                View employee →
              </Link>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">Not currently assigned</p>
              {asset.status === 'available' && (
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => setAssignOpen(true)}
                >
                  <UserPlus className="size-4" /> Assign to employee
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Assignment history</h3>
        {asset.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignment history yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Assigned</th>
                  <th className="px-3 py-2 text-left">Returned</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...asset.history].reverse().map((h, i) => {
                  const emp = typeof h.employee === 'object' ? h.employee : null;
                  return (
                    <tr key={h._id ?? i} className="border-t border-border">
                      <td className="px-3 py-2">
                        {emp ? (
                          <div>
                            <p className="font-medium">
                              {emp.firstName} {emp.lastName}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {emp.employeeId}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {String(h.employee)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{formatDate(h.assignedAt)}</td>
                      <td className="px-3 py-2 text-xs">
                        {h.returnedAt ? (
                          formatDate(h.returnedAt)
                        ) : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {h.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="assign-emp">Employee *</Label>
            <Select
              id="assign-emp"
              value={assignEmpId}
              onChange={(e) => setAssignEmpId(e.target.value)}
            >
              <option value="">Select an employee</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.firstName} {e.lastName} ({e.employeeId})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="assign-notes">Notes</Label>
            <Textarea
              id="assign-notes"
              rows={3}
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="e.g., handed over with charger and case"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submitAssign}
            disabled={!assignEmpId}
            loading={assign.isPending}
          >
            Assign
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={unassignOpen} onClose={() => setUnassignOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Unassign asset</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Marks this asset as available and records the return in the history.
          </p>
          <div>
            <Label htmlFor="ua-cond">Condition on return</Label>
            <Select
              id="ua-cond"
              value={unassignCondition}
              onChange={(e) => setUnassignCondition(e.target.value as AssetCondition | '')}
            >
              <option value="">Keep current ({asset.condition})</option>
              {ASSET_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ua-notes">Return notes</Label>
            <Textarea
              id="ua-notes"
              rows={3}
              value={unassignNotes}
              onChange={(e) => setUnassignNotes(e.target.value)}
              placeholder="e.g., screen has minor scratches"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setUnassignOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submitUnassign} loading={unassign.isPending}>
            Confirm unassign
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</p>
      </div>
    </div>
  );
}
