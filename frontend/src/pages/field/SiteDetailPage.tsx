import { useState, type ReactElement, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, CalendarPlus, History, MapPin, Pencil, Phone, Trash2, User } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PhotoStrip, VisitFlagBadges, VisitStatusBadge } from '@/components/field/FieldBits';
import { PlanVisitDialog } from '@/components/field/PlanVisitDialog';
import { SiteFormDialog } from '@/components/field/SiteFormDialog';
import { SiteMiniMap } from '@/components/field/SiteMiniMap';
import { useCanManageField, useDeleteSite, useMyEmployeeId, useSite } from '@/hooks/use-field';
import { apiErrorMessage, apiErrorStatus } from '@/lib/api-error';
import { personName, type VisitSummary } from '@/lib/field.api';
import { canEditSite, formatMinutes, OUTCOME_LABEL } from '@/lib/field-visits';
import { formatDate, formatDateTime } from '@/lib/format';

const CREATED_VIA: Record<string, string> = { mobile_pin: 'pinned from the mobile app', web: 'added on the website' };

function visitWhen(v: VisitSummary): string {
  if (v.checkIn?.at) return formatDateTime(v.checkIn.at);
  if (v.plannedDate) return `${formatDate(v.plannedDate)} (planned)`;
  return '—';
}

function Detail({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** One site: its details and pin, and the visits made there. */
export default function SiteDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canManage = useCanManageField();
  const myEmployeeId = useMyEmployeeId();
  const { data, isLoading, error } = useSite(id);
  const remove = useDeleteSite();
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const crumbs = [
    { label: 'Home', to: '/dashboard' },
    { label: 'Field Visits' },
    { label: 'Sites', to: '/field/sites' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Site" breadcrumbs={crumbs} icon={Building2} />
        <EmptyState
          icon={Building2}
          title={apiErrorStatus(error) === 404 ? 'Site not found' : "Couldn't load the site"}
          description={
            apiErrorStatus(error) === 404
              ? 'It may have been deleted, or it is not one of the sites you can see.'
              : apiErrorMessage(error)
          }
          action={
            <Button variant="outline" asChild>
              <Link to="/field/sites">Back to sites</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const site = data.data;
  const address = [site.address?.line1, site.address?.city, site.address?.state, site.address?.pincode]
    .filter(Boolean)
    .join(', ');
  const visits = site.recentVisits ?? [];

  const columns: DataTableColumn<VisitSummary>[] = [
    { key: 'when', header: 'When', cell: (v) => <span className="whitespace-nowrap text-xs">{visitWhen(v)}</span> },
    { key: 'who', header: 'Employee', cell: (v) => <span className="text-xs">{personName(v.employee)}</span> },
    { key: 'purpose', header: 'Purpose', cell: (v) => <span className="text-xs">{v.purpose}</span> },
    { key: 'status', header: 'Status', cell: (v) => <VisitStatusBadge status={v.status} /> },
    { key: 'duration', header: 'Time on site', cell: (v) => <span className="text-xs">{formatMinutes(v.durationMinutes)}</span> },
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (v) => (
        <span className="text-xs">{v.report?.outcome ? OUTCOME_LABEL[v.report.outcome] ?? v.report.outcome : '—'}</span>
      ),
    },
    { key: 'flags', header: 'Flags', cell: (v) => <VisitFlagBadges flags={v.flags} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={site.name}
        titleAddon={<Badge variant="secondary">{site.type}</Badge>}
        description={address || undefined}
        icon={Building2}
        breadcrumbs={[...crumbs, { label: site.name }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPlanning(true)}>
              <CalendarPlus className="size-4" />
              Plan a visit
            </Button>
            {canEditSite(site, { canManage, myEmployeeId }) && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
            {canManage && (
              <Button variant="outline" className="text-destructive" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Pin">
                <span className="font-mono text-xs">
                  {site.location.lat.toFixed(5)}, {site.location.lng.toFixed(5)}
                </span>
              </Detail>
              <Detail label="Allowed radius">{site.radiusM} m</Detail>
              <Detail label="Contact">
                {site.contactName || site.contactPhone ? (
                  <span className="space-y-0.5">
                    {site.contactName && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" /> {site.contactName}
                      </span>
                    )}
                    {site.contactPhone && (
                      <a href={`tel:${site.contactPhone}`} className="flex items-center gap-1 text-primary hover:underline">
                        <Phone className="size-3" /> {site.contactPhone}
                      </a>
                    )}
                  </span>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Visits">
                {site.visitCount ?? 0}
                {site.lastVisitAt ? ` · last ${formatDate(site.lastVisitAt)}` : ''}
              </Detail>
              <div className="col-span-2">
                <Detail label="Assigned to">
                  {site.assignedTo?.length ? site.assignedTo.map(personName).join(', ') : '—'}
                </Detail>
              </div>
              {site.notes && (
                <div className="col-span-2">
                  <Detail label="Notes">
                    <span className="whitespace-pre-wrap">{site.notes}</span>
                  </Detail>
                </div>
              )}
              <div className="col-span-2 text-xs text-muted-foreground">
                {site.createdBy ? `By ${personName(site.createdBy)}` : 'Added'}
                {site.createdVia ? `, ${CREATED_VIA[site.createdVia] ?? site.createdVia}` : ''}
                {site.createdAt ? ` on ${formatDate(site.createdAt)}` : ''}
              </div>
              {site.photoUrl && (
                <div className="col-span-2">
                  <PhotoStrip urls={[site.photoUrl]} size={96} alt="Site photo" />
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
        <div className="lg:col-span-3">
          <SiteMiniMap site={site} height={360} />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${site.location.lat},${site.location.lng}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <MapPin className="size-3" />
            Open in Google Maps
          </a>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="size-5 text-muted-foreground" />
            Recent visits
          </h2>
          <Link to={`/field/visits?siteId=${encodeURIComponent(site._id)}`} className="text-sm font-medium text-primary hover:underline">
            All visits at this site
          </Link>
        </div>
        <DataTable
          columns={columns}
          data={visits}
          rowKey={(v) => v._id}
          onRowClick={(v) => navigate(`/field/visits/${v._id}`)}
          emptyTitle="No visits yet"
          emptyDescription="Visits appear here once someone checks in at this site."
        />
      </section>

      <SiteFormDialog open={editing} site={site} onClose={() => setEditing(false)} />
      <PlanVisitDialog open={planning} site={site} onClose={() => setPlanning(false)} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate(site._id, { onSuccess: () => navigate('/field/sites') })}
        loading={remove.isPending}
        title={`Delete ${site.name}?`}
        description="The site disappears from lists and maps and can no longer be visited. Its past visits stay on record."
        confirmLabel="Delete site"
      />
    </div>
  );
}
