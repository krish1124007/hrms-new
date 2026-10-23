import { useState, type ReactElement, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, ClipboardCheck, FileText, MapPin, Phone, Users, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { CancelVisitDialog } from '@/components/field/CancelVisitDialog';
import { PhotoStrip, VisitFlagBadges, VisitStatusBadge } from '@/components/field/FieldBits';
import { SiteMiniMap } from '@/components/field/SiteMiniMap';
import { useFieldSettings, useVisit } from '@/hooks/use-field';
import { apiErrorMessage, apiErrorStatus } from '@/lib/api-error';
import { personName, type Checklist, type Report, type Visit, type VisitPoint } from '@/lib/field.api';
import { answerText, formatDistance, formatMinutes, OUTCOME_LABEL } from '@/lib/field-visits';
import { formatDate, formatDateTime } from '@/lib/format';

function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function PointFact({ label, point, radiusM }: { label: string; point?: VisitPoint; radiusM: number }): ReactElement {
  if (!point) return <Fact label={label}>—</Fact>;
  const away = point.distanceM != null && point.distanceM > radiusM;
  return (
    <Fact label={label}>
      <span className="block">{formatDateTime(point.at)}</span>
      <span className="block text-xs text-muted-foreground">
        {point.location ? (
          <>
            <span className={away ? 'font-medium text-destructive' : undefined}>
              {formatDistance(point.distanceM)} from the pin
            </span>
            {point.accuracy != null ? ` · GPS ±${Math.round(point.accuracy)} m` : ''}
          </>
        ) : (
          'No location'
        )}
      </span>
      {point.notes ? <span className="mt-0.5 block whitespace-pre-line">“{point.notes}”</span> : null}
    </Fact>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: ReactNode }): ReactElement {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function ChecklistAnswers({ report, checklists }: { report: Report; checklists: Checklist[] }): ReactElement | null {
  const filled = report.checklist;
  if (!filled || filled.answers.length === 0) return null;
  const def = checklists.find((c) => c._id === filled.checklistId);
  const items = new Map((def?.items ?? []).map((i) => [i._id, i]));
  const title = def?.name ?? 'Checklist';
  return (
    <Section title={title} icon={ClipboardCheck}>
      <table className="w-full text-sm" aria-label={title}>
        <tbody>
          {filled.answers.map((a, n) => {
            const item = items.get(a.itemId);
            return (
              <tr key={`${a.itemId}-${n}`} className="border-t border-border first:border-t-0">
                <td className="py-1.5 pr-4 text-muted-foreground">{item?.label ?? `Item ${n + 1}`}</td>
                <td className="py-1.5 font-medium">
                  {item?.kind === 'photo' && typeof a.value === 'string' && a.value ? (
                    <PhotoStrip urls={[a.value]} size={56} alt={item.label} />
                  ) : (
                    answerText(item?.kind, a.value)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!def && (
        <p className="text-xs text-muted-foreground">This checklist has since been removed from the settings.</p>
      )}
    </Section>
  );
}

function WorkReport({ visit, checklists }: { visit: Visit; checklists: Checklist[] }): ReactElement {
  const r = visit.report;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">
          <h2>Work report</h2>
        </CardTitle>
        {r?.submittedAt && <span className="text-xs text-muted-foreground">Filed {formatDateTime(r.submittedAt)}</span>}
      </CardHeader>
      <CardContent>
        {!r ? (
          <p className="text-sm text-muted-foreground">
            {visit.status === 'completed'
              ? 'No report was filed for this visit.'
              : 'The report is filed from the mobile app at check-out.'}
          </p>
        ) : (
          <div className="space-y-5">
            <Section title="Notes" icon={FileText}>
              <p className="whitespace-pre-wrap text-sm">{r.notes || '—'}</p>
            </Section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label="Outcome">{r.outcome ? (OUTCOME_LABEL[r.outcome] ?? r.outcome) : '—'}</Fact>
              {r.followUpDate && <Fact label="Follow-up on">{formatDate(r.followUpDate)}</Fact>}
              {r.nextAction && (
                <div className="sm:col-span-2">
                  <Fact label="Next action">{r.nextAction}</Fact>
                </div>
              )}
            </div>

            <Section title={`Photos (${r.photos?.length ?? 0})`} icon={Camera}>
              {r.photos?.length ? (
                <PhotoStrip urls={r.photos} size={96} alt="Report photo" />
              ) : (
                <p className="text-sm text-muted-foreground">No photos.</p>
              )}
            </Section>

            <Section title={`Documents (${r.documents?.length ?? 0})`} icon={FileText}>
              {r.documents?.length ? (
                <ul className="space-y-1 text-sm">
                  {r.documents.map((d, i) => (
                    <li key={`${d.url}-${i}`}>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        <FileText className="size-3.5" aria-hidden />
                        {d.name || `Document ${i + 1}`}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No documents.</p>
              )}
            </Section>

            <Section title="People met" icon={Users}>
              {r.peopleMet?.length ? (
                <ul className="divide-y divide-border rounded-md border border-border text-sm">
                  {r.peopleMet.map((p, i) => (
                    <li key={`${p.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="font-medium">{p.name}</span>
                        {p.designation && <span className="text-muted-foreground"> · {p.designation}</span>}
                      </span>
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Phone className="size-3" /> {p.phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nobody recorded.</p>
              )}
            </Section>

            <ChecklistAnswers report={r} checklists={checklists} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One visit: where and when the check-in and check-out happened, the selfie, the flags and the work report. */
export default function VisitDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useVisit(id);
  const { settings } = useFieldSettings();
  const [cancelling, setCancelling] = useState<Visit | null>(null);
  const crumbs = [
    { label: 'Home', to: '/dashboard' },
    { label: 'Field Visits' },
    { label: 'Visits', to: '/field/visits' },
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
    const missing = apiErrorStatus(error) === 404;
    return (
      <div className="space-y-6">
        <PageHeader title="Visit" breadcrumbs={crumbs} icon={MapPin} />
        <EmptyState
          icon={MapPin}
          title={missing ? 'Visit not found' : "Couldn't load the visit"}
          description={missing ? 'It may not be one of the visits you can see.' : apiErrorMessage(error)}
          action={
            <Button variant="outline" asChild>
              <Link to="/field/visits">Back to visits</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const visit = data.data;
  const cancellable = visit.status === 'planned' || visit.status === 'in_progress';
  // An unplanned visit keeps its arrival note as the visit's notes too: it shows with the check-in.
  const planningNotes = visit.notes && visit.notes !== visit.checkIn?.notes ? visit.notes : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Visit to ${visit.site?.name ?? 'a site'}`}
        titleAddon={<VisitStatusBadge status={visit.status} />}
        description={`${personName(visit.employee)} · ${visit.purpose}`}
        icon={MapPin}
        breadcrumbs={[...crumbs, { label: visit.site?.name ?? 'Visit' }]}
        actions={
          cancellable ? (
            <Button variant="outline" className="text-destructive" onClick={() => setCancelling(visit)}>
              <XCircle className="size-4" />
              Cancel visit
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Visit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <Fact label="Employee">
                {personName(visit.employee)}
                {visit.employee?.employeeId ? ` (${visit.employee.employeeId})` : ''}
              </Fact>
              <Fact label="Site">
                {visit.site ? (
                  <Link to={`/field/sites/${visit.site._id}`} className="font-medium text-primary hover:underline">
                    {visit.site.name}
                  </Link>
                ) : (
                  '—'
                )}
              </Fact>
              <Fact label="Purpose">{visit.purpose}</Fact>
              <Fact label="Planned for">{visit.plannedDate ? formatDate(visit.plannedDate) : 'Unplanned'}</Fact>
              <PointFact label="Check-in" point={visit.checkIn} radiusM={visit.site?.radiusM ?? 0} />
              <PointFact label="Check-out" point={visit.checkOut} radiusM={visit.site?.radiusM ?? 0} />
              <Fact label="Time on site">{formatMinutes(visit.durationMinutes)}</Fact>
              <Fact label="Allowed radius">{visit.site ? `${visit.site.radiusM} m` : '—'}</Fact>
              {planningNotes && (
                <div className="col-span-2">
                  <Fact label={visit.plannedDate ? 'Planning notes' : 'Notes'}>{planningNotes}</Fact>
                </div>
              )}
              {visit.status === 'cancelled' && visit.cancelReason && (
                <div className="col-span-2">
                  <Fact label="Cancelled because">{visit.cancelReason}</Fact>
                </div>
              )}
            </dl>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Flags</div>
              <VisitFlagBadges flags={visit.flags} emptyText="Nothing flagged." />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Selfie at check-in</div>
              {visit.checkIn?.selfieUrl ? (
                <PhotoStrip urls={[visit.checkIn.selfieUrl]} size={112} alt="Check-in selfie" />
              ) : (
                <p className="text-sm text-muted-foreground">{visit.checkIn ? 'No selfie.' : '—'}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-2 lg:col-span-3">
          {visit.site?.location ? (
            <SiteMiniMap site={visit.site} checkIn={visit.checkIn} checkOut={visit.checkOut} height={420} />
          ) : (
            <EmptyState icon={MapPin} title="No site location" />
          )}
          <p className="text-xs text-muted-foreground">
            The circle is the site&apos;s allowed radius; “In” and “Out” are where the check-in and check-out were
            recorded.
          </p>
        </div>
      </div>

      <WorkReport visit={visit} checklists={settings.checklists} />

      <CancelVisitDialog visit={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}
