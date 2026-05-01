import { useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  Send,
  Archive,
  RotateCcw,
  CheckCircle2,
  Star,
  History,
  Users,
  Paperclip,
  Download,
  Upload,
  FileText,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  useAcknowledgePolicy,
  useArchivePolicy,
  useDeletePolicy,
  useDeletePolicyAttachment,
  usePolicy,
  usePolicyAcknowledgements,
  usePublishPolicy,
  useRestorePolicy,
  useUploadPolicyAttachment,
} from '@/hooks/use-hr-policies';
import { useEmployees } from '@/hooks/use-systemcore';
import { POLICY_CATEGORIES, type PolicyStatus } from '@/lib/hr-policies.api';
import { formatDate, formatRelative } from '@/lib/format';
import { usePermissions } from '@/hooks/use-permissions';

const STATUS_VARIANT: Record<PolicyStatus, 'default' | 'success' | 'warning' | 'secondary'> = {
  draft: 'warning',
  published: 'success',
  archived: 'secondary',
};

export default function PolicyDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = usePolicy(id);
  const { data: ackData } = usePolicyAcknowledgements(id);
  const publish = usePublishPolicy();
  const archive = useArchivePolicy();
  const restore = useRestorePolicy();
  const remove = useDeletePolicy();
  const acknowledge = useAcknowledgePolicy();
  const uploadAttachment = useUploadPolicyAttachment();
  const deleteAttachment = useDeletePolicyAttachment();
  const { data: empData } = useEmployees({ limit: 500 });
  const employees = empData?.data ?? [];
  const { has } = usePermissions();
  const canManage = has('policies.manage');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/api\/v1\/?$/,
    '',
  ) ?? '';
  const attachmentHref = (relUrl: string): string =>
    /^https?:\/\//i.test(relUrl) ? relUrl : `${apiOrigin}${relUrl}`;

  const [pubOpen, setPubOpen] = useState(false);
  const [pubEffective, setPubEffective] = useState('');
  const [pubNotes, setPubNotes] = useState('');

  const [ackOpen, setAckOpen] = useState(false);
  const [ackEmp, setAckEmp] = useState('');
  const [ackComment, setAckComment] = useState('');

  const [historyOpen, setHistoryOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const p = data?.data;
  if (!p) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Policy not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/hr-policies')}>
          Back
        </Button>
      </div>
    );
  }

  const categoryLabel =
    POLICY_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category;
  const ackSummary = ackData?.data.summary;

  const handleDelete = (): void => {
    if (!confirm(`Delete policy ${p.policyCode}? This cannot be undone.`)) return;
    remove.mutate(p._id, { onSuccess: () => navigate('/hr-policies') });
  };

  const submitPublish = (): void => {
    publish.mutate(
      {
        id: p._id,
        effectiveDate: pubEffective || undefined,
        changeNotes: pubNotes || undefined,
      },
      {
        onSuccess: () => {
          setPubOpen(false);
          setPubEffective('');
          setPubNotes('');
        },
      },
    );
  };

  const submitAck = (): void => {
    if (!ackEmp) return;
    acknowledge.mutate(
      { id: p._id, employee: ackEmp, comment: ackComment || undefined },
      {
        onSuccess: () => {
          setAckOpen(false);
          setAckEmp('');
          setAckComment('');
        },
      },
    );
  };

  const onPickAttachment = (): void => fileInputRef.current?.click();
  const onAttachmentSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAttachment.mutateAsync({ id: p._id, file });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const onDeleteAttachment = (attachmentId: string, name: string): void => {
    if (!confirm(`Remove attachment "${name}"?`)) return;
    deleteAttachment.mutate({ id: p._id, attachmentId });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.title}
        description={p.policyCode}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'HR Policies', to: '/hr-policies' },
          { label: p.policyCode },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/hr-policies')}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {p.status === 'draft' && (
              <Button size="sm" onClick={() => setPubOpen(true)}>
                <Send className="size-4" /> Publish
              </Button>
            )}
            {p.status === 'published' && (
              <Button size="sm" onClick={() => setAckOpen(true)}>
                <CheckCircle2 className="size-4" /> Record acknowledgement
              </Button>
            )}
            {(p.status === 'draft' || p.status === 'published') && (
              <Button variant="outline" size="sm" onClick={() => archive.mutate(p._id)}>
                <Archive className="size-4" /> Archive
              </Button>
            )}
            {p.status === 'archived' && (
              <Button size="sm" onClick={() => restore.mutate(p._id)}>
                <RotateCcw className="size-4" /> Restore
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to={`/hr-policies/${p._id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" /> History
            </Button>
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {p.mandatory && <Star className="size-4 fill-warning text-warning" />}
                {p.title}
              </h2>
              {p.summary && <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>}
              {p.tags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={STATUS_VARIANT[p.status]} className="capitalize">
                {p.status}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                v{p.currentVersion}
              </span>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Detail label="Category" value={categoryLabel} />
            {p.effectiveDate && (
              <Detail label="Effective from" value={formatDate(p.effectiveDate)} />
            )}
            {p.reviewDueDate && (
              <Detail label="Next review" value={formatDate(p.reviewDueDate)} />
            )}
            <Detail label="Created" value={formatDate(p.createdAt)} />
            <Detail label="Updated" value={formatDate(p.updatedAt)} />
          </div>

          <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-4 font-sans text-sm leading-relaxed">
            {p.content}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Paperclip className="size-4 text-muted-foreground" /> Attachments
              </h3>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onPickAttachment}
                  loading={uploadAttachment.isPending}
                >
                  <Upload className="size-4" /> Upload PDF
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={onAttachmentSelected}
            />
            {p.attachments?.length ? (
              <ul className="space-y-2">
                {p.attachments.map((a) => (
                  <li
                    key={a._id ?? a.url}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="size-5 shrink-0 text-red-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={a.name}>
                          {a.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {formatRelative(a.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={attachmentHref(a.url)}
                        target="_blank"
                        rel="noreferrer"
                        download={a.name}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Download"
                      >
                        <Download className="size-4" />
                      </a>
                      {canManage && a._id && (
                        <button
                          onClick={() => onDeleteAttachment(a._id as string, a.name)}
                          disabled={deleteAttachment.isPending}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Remove attachment"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {canManage
                  ? 'No attachments yet — upload a PDF for employees to download.'
                  : 'No attachments available.'}
              </p>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Users className="size-4 text-muted-foreground" /> Acknowledgements
          </h3>
          {p.status !== 'published' ? (
            <p className="text-sm text-muted-foreground">
              Acknowledgements become available after the policy is published.
            </p>
          ) : ackSummary ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Acknowledged</span>
                  <span>
                    {ackSummary.acknowledged} / {ackSummary.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-success transition-all"
                    style={{
                      width: `${
                        ackSummary.total > 0
                          ? (ackSummary.acknowledged / ackSummary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Acknowledged</p>
                  <p className="font-semibold">{ackSummary.acknowledged}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="font-semibold">{ackSummary.pending}</p>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => setAckOpen(true)}
                disabled={p.status !== 'published'}
              >
                <CheckCircle2 className="size-4" /> Record acknowledgement
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading acknowledgement summary...</p>
          )}
        </Card>
      </div>

      {p.acknowledgements?.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 text-base font-semibold">Acknowledgement log</h3>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-left">Acknowledged</th>
                  <th className="px-3 py-2 text-left">Comment</th>
                </tr>
              </thead>
              <tbody>
                {[...p.acknowledgements]
                  .sort(
                    (a, b) =>
                      new Date(b.acknowledgedAt).getTime() -
                      new Date(a.acknowledgedAt).getTime(),
                  )
                  .map((a) => {
                    const emp = a.employee;
                    return (
                      <tr key={a._id} className="border-t border-border">
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
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs">v{a.versionNumber}</span>
                          {a.versionNumber < p.currentVersion && (
                            <Badge variant="warning" className="ml-2">
                              outdated
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {formatDate(a.acknowledgedAt)} ·{' '}
                          <span className="text-muted-foreground">
                            {formatRelative(a.acknowledgedAt)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {a.comment || '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={pubOpen} onClose={() => setPubOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Publish policy</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Publishing makes v{p.currentVersion} the live version. Employees can then
            acknowledge it.
          </p>
          <div>
            <Label htmlFor="pub-eff">Effective date</Label>
            <Input
              id="pub-eff"
              type="date"
              value={pubEffective}
              onChange={(e) => setPubEffective(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pub-cn">Change notes</Label>
            <Textarea
              id="pub-cn"
              rows={3}
              value={pubNotes}
              onChange={(e) => setPubNotes(e.target.value)}
              placeholder="What's new in this version? (Shown in version history.)"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPubOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submitPublish} loading={publish.isPending}>
            Publish
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={ackOpen} onClose={() => setAckOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Record acknowledgement</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Records that the selected employee has read and accepted v{p.currentVersion}.
          </p>
          <div>
            <Label htmlFor="ack-emp">Employee *</Label>
            <Select id="ack-emp" value={ackEmp} onChange={(e) => setAckEmp(e.target.value)}>
              <option value="">Select an employee</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.firstName} {e.lastName} ({e.employeeId})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ack-cm">Comment</Label>
            <Textarea
              id="ack-cm"
              rows={2}
              value={ackComment}
              onChange={(e) => setAckComment(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAckOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submitAck} disabled={!ackEmp} loading={acknowledge.isPending}>
            Record
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {p.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            <ul className="space-y-3">
              {[...p.versions]
                .sort((a, b) => b.versionNumber - a.versionNumber)
                .map((v) => (
                  <li
                    key={v._id ?? v.versionNumber}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold">
                        v{v.versionNumber}
                      </span>
                      {v.publishedAt ? (
                        <Badge variant="success">
                          Published {formatDate(v.publishedAt)}
                        </Badge>
                      ) : (
                        <Badge variant="warning">Draft</Badge>
                      )}
                    </div>
                    {v.publishedBy && (
                      <p className="text-xs text-muted-foreground">
                        Published by {v.publishedBy.firstName} {v.publishedBy.lastName}
                      </p>
                    )}
                    {v.effectiveDate && (
                      <p className="text-xs text-muted-foreground">
                        Effective from {formatDate(v.effectiveDate)}
                      </p>
                    )}
                    {v.changeNotes && (
                      <p className="mt-2 text-sm">{v.changeNotes}</p>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setHistoryOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
