import { useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, FileUp, List, Loader2, LocateFixed, Map as MapIcon, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowActionsMenu, type RowAction } from '@/components/common/RowActionsMenu';
import { SiteFormDialog } from '@/components/field/SiteFormDialog';
import { SiteImportDialog } from '@/components/field/SiteImportDialog';
import { SitesMap } from '@/components/field/SitesMap';
import { useDebounced } from '@/hooks/use-debounced';
import {
  useCanManageField,
  useCanPickEmployees,
  useDeleteSite,
  useFieldReps,
  useFieldSettings,
  useMyUserId,
  useSites,
} from '@/hooks/use-field';
import { personName, type Site } from '@/lib/field.api';
import { canEditSite, formatDistance } from '@/lib/field-visits';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const NEAR_RADII_KM = [1, 5, 10, 25, 50];
function addressLine(s: Site): string {
  const a = s.address ?? {};
  return [a.line1, a.city, a.state].filter(Boolean).join(', ');
}

export default function SitesPage(): ReactElement {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'map' ? 'map' : 'list';
  const setView = (v: 'list' | 'map'): void => {
    const next = new URLSearchParams(params);
    if (v === 'map') next.set('view', 'map');
    else next.delete('view');
    setParams(next, { replace: true });
  };

  const canManage = useCanManageField();
  const myUserId = useMyUserId();
  const canPick = useCanPickEmployees();
  const { data: people = [] } = useFieldReps(canPick);
  const { settings } = useFieldSettings();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [type, setType] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [locating, setLocating] = useState(false);

  const { data, isLoading, error, refetch } = useSites(
    {
      page,
      limit: 20,
      search: q || undefined,
      type: type || undefined,
      assignedTo: assignedTo || undefined,
      ...(near ? { near: `${near.lat},${near.lng}`, radiusKm } : {}),
    },
    { enabled: view === 'list' },
  );
  const remove = useDeleteSite();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<Site | null>(null);

  const toggleNear = (): void => {
    if (near) {
      setNear(null);
      setPage(1);
      return;
    }
    if (!navigator.geolocation) {
      toast.error('This browser cannot share its location');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setNear({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 });
        setPage(1);
      },
      () => {
        setLocating(false);
        toast.error('Unable to get your location');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const columns: DataTableColumn<Site>[] = [
    {
      key: 'name',
      header: 'Site',
      cell: (s) => (
        <div className="min-w-[180px]">
          <div className="flex items-center gap-1.5 font-medium">
            <MapPin className="size-3 text-muted-foreground" aria-hidden />
            {s.name}
          </div>
          {addressLine(s) && <div className="text-xs text-muted-foreground">{addressLine(s)}</div>}
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (s) => <Badge variant="secondary">{s.type}</Badge> },
    {
      key: 'assigned',
      header: 'Assigned to',
      cell: (s) =>
        s.assignedTo?.length ? (
          <span className="text-xs">
            {s.assignedTo.slice(0, 2).map(personName).join(', ')}
            {s.assignedTo.length > 2 ? ` +${s.assignedTo.length - 2}` : ''}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (s) => (
        <div className="text-xs">
          {s.contactName && <div>{s.contactName}</div>}
          {s.contactPhone && <div className="text-muted-foreground">{s.contactPhone}</div>}
          {!s.contactName && !s.contactPhone && <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: 'visits',
      header: 'Visits',
      cell: (s) => (
        <div className="text-xs">
          <div>{s.visitCount ?? 0}</div>
          <div className="text-muted-foreground">{s.lastVisitAt ? `last ${formatDate(s.lastVisitAt)}` : 'never visited'}</div>
        </div>
      ),
    },
    ...(near
      ? [{ key: 'distance', header: 'Distance', cell: (s: Site) => <span className="text-xs">{formatDistance(s.distanceM)}</span> }]
      : []),
    {
      key: 'actions',
      header: '',
      width: '56px',
      cell: (s) => {
        const actions: RowAction[] = [];
        if (canEditSite(s, { canManage, myUserId })) {
          actions.push({
            label: 'Edit',
            icon: Pencil,
            onSelect: () => {
              setEditing(s);
              setFormOpen(true);
            },
          });
        }
        if (canManage) actions.push({ label: 'Delete', icon: Trash2, onSelect: () => setDeleting(s), destructive: true });
        return actions.length ? (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <RowActionsMenu actions={actions} label={`Actions for ${s.name}`} />
          </div>
        ) : null;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites"
        description={
          canManage
            ? 'Every place the field team visits, with its pin and allowed radius'
            : 'Sites assigned to you or your team, and the ones you added'
        }
        icon={Building2}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Sites' }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-md border border-input p-0.5" role="group" aria-label="View">
              <button
                type="button"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                className={cn('flex items-center gap-1 rounded px-2.5 py-1.5 text-sm', view === 'list' && 'bg-muted font-medium')}
              >
                <List className="size-4" /> List
              </button>
              <button
                type="button"
                aria-pressed={view === 'map'}
                onClick={() => setView('map')}
                className={cn('flex items-center gap-1 rounded px-2.5 py-1.5 text-sm', view === 'map' && 'bg-muted font-medium')}
              >
                <MapIcon className="size-4" /> Map
              </button>
            </div>
            {canManage && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp className="size-4" />
                Import
              </Button>
            )}
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              New site
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {view === 'list' && (
          <Input
            placeholder="Search name, address, contact…"
            aria-label="Search sites"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        )}
        <Select
          aria-label="Site type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All types</option>
          {settings.siteTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        {view === 'list' && canPick && (
          <Select
            aria-label="Assigned to"
            value={assignedTo}
            onChange={(e) => {
              setAssignedTo(e.target.value);
              setPage(1);
            }}
            className="w-48"
          >
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p._id} value={p._id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </Select>
        )}
        {view === 'list' && (
          <>
            <Button variant={near ? 'default' : 'outline'} onClick={toggleNear} disabled={locating} aria-pressed={!!near}>
              {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
              Near me
            </Button>
            {near && (
              <Select
                aria-label="Within"
                value={String(radiusKm)}
                onChange={(e) => {
                  setRadiusKm(Number(e.target.value));
                  setPage(1);
                }}
                className="w-32"
              >
                {NEAR_RADII_KM.map((km) => (
                  <option key={km} value={km}>
                    Within {km} km
                  </option>
                ))}
              </Select>
            )}
          </>
        )}
      </div>

      {view === 'map' ? (
        <SitesMap type={type || undefined} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            rowKey={(s) => s._id}
            onRowClick={(s) => navigate(`/field/sites/${s._id}`)}
            emptyTitle={near ? 'No sites nearby' : 'No sites'}
            emptyDescription={
              near
                ? `Nothing within ${radiusKm} km of you. Try a wider distance.`
                : 'Add a site here or pin one from the mobile app.'
            }
          />
          <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />
        </>
      )}

      <SiteFormDialog
        open={formOpen}
        site={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(s) => {
          if (!editing) navigate(`/field/sites/${s._id}`);
        }}
      />
      {canManage && <SiteImportDialog open={importOpen} onClose={() => setImportOpen(false)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting._id, { onSuccess: () => setDeleting(null) })}
        loading={remove.isPending}
        title={`Delete ${deleting?.name ?? 'site'}?`}
        description="The site disappears from lists and maps and can no longer be visited. Its past visits stay on record."
        confirmLabel="Delete site"
      />
    </div>
  );
}
