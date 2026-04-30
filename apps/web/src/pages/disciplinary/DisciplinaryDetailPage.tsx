import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Ban,
  Lock,
  MessageSquare,
  Send,
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
  useAcknowledgeDisciplinary,
  useAddDisciplinaryComment,
  useCancelDisciplinary,
  useDeleteDisciplinary,
  useDisciplinary,
  useEscalateDisciplinary,
  useResolveDisciplinary,
} from '@/hooks/use-disciplinary';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/axios';

interface UserOption {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

function useUsersForEscalation() {
  return useQuery({
    queryKey: ['users', 'escalation-list'],
    queryFn: async (): Promise<{ data: UserOption[] }> => {
      const res = await api.get('/users', { params: { limit: 200 } });
      return res.data;
    },
  });
}
import {
  DISCIPLINARY_SEVERITIES,
  DISCIPLINARY_TYPES,
  type DisciplinarySeverity,
  type DisciplinaryStatus,
} from '@/lib/disciplinary.api';
import { formatDate, formatRelative } from '@/lib/format';

const STATUS_VARIANT: Record<DisciplinaryStatus, 'default' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  open: 'warning',
  acknowledged: 'default',
  in_progress: 'default',
  escalated: 'destructive',
  resolved: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
};

const SEVERITY_VARIANT: Record<DisciplinarySeverity, 'success' | 'default' | 'warning' | 'destructive'> = {
  low: 'success',
  medium: 'default',
  high: 'warning',
  critical: 'destructive',
};

export default function DisciplinaryDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useDisciplinary(id);
  const acknowledge = useAcknowledgeDisciplinary();
  const resolve = useResolveDisciplinary();
  const escalate = useEscalateDisciplinary();
  const cancel = useCancelDisciplinary();
  const remove = useDeleteDisciplinary();
  const addComment = useAddDisciplinaryComment();
  const { data: usersData } = useUsersForEscalation();
  const users = usersData?.data ?? [];

  const [ackOpen, setAckOpen] = useState(false);
  const [ackNotes, setAckNotes] = useState('');

  const [resOpen, setResOpen] = useState(false);
  const [resOutcome, setResOutcome] = useState<'resolved' | 'failed'>('resolved');
  const [resNotes, setResNotes] = useState('');

  const [escOpen, setEscOpen] = useState(false);
  const [escTo, setEscTo] = useState('');
  const [escReason, setEscReason] = useState('');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [commentText, setCommentText] = useState('');

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const action = data?.data;
  if (!action) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Case not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/disciplinary')}>
          Back
        </Button>
      </div>
    );
  }

  const typeLabel =
    DISCIPLINARY_TYPES.find((t) => t.value === action.type)?.label ?? action.type;
  const severityLabel =
    DISCIPLINARY_SEVERITIES.find((s) => s.value === action.severity)?.label ?? action.severity;
  const isClosed =
    action.status === 'resolved' || action.status === 'failed' || action.status === 'cancelled';
  const canAcknowledge = action.status === 'open';

  const handleAcknowledge = (): void => {
    acknowledge.mutate(
      { id: action._id, notes: ackNotes || undefined },
      {
        onSuccess: () => {
          setAckOpen(false);
          setAckNotes('');
        },
      },
    );
  };

  const handleResolve = (): void => {
    if (!resNotes.trim()) return;
    resolve.mutate(
      { id: action._id, outcome: resOutcome, notes: resNotes.trim() },
      {
        onSuccess: () => {
          setResOpen(false);
          setResNotes('');
        },
      },
    );
  };

  const handleEscalate = (): void => {
    if (!escTo || !escReason.trim()) return;
    escalate.mutate(
      { id: action._id, escalatedTo: escTo, reason: escReason.trim() },
      {
        onSuccess: () => {
          setEscOpen(false);
          setEscTo('');
          setEscReason('');
        },
      },
    );
  };

  const handleCancel = (): void => {
    cancel.mutate(
      { id: action._id, reason: cancelReason || undefined },
      {
        onSuccess: () => {
          setCancelOpen(false);
          setCancelReason('');
        },
      },
    );
  };

  const handleDelete = (): void => {
    if (!confirm(`Delete case ${action.caseNumber}? This cannot be undone.`)) return;
    remove.mutate(action._id, { onSuccess: () => navigate('/disciplinary') });
  };

  const submitComment = (): void => {
    if (!commentText.trim()) return;
    addComment.mutate(
      { id: action._id, text: commentText.trim() },
      { onSuccess: () => setCommentText('') },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={action.caseNumber}
        description={action.title}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Disciplinary', to: '/disciplinary' },
          { label: action.caseNumber },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/disciplinary')}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {canAcknowledge && (
              <Button size="sm" onClick={() => setAckOpen(true)}>
                <CheckCircle2 className="size-4" /> Acknowledge
              </Button>
            )}
            {!isClosed && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEscOpen(true)}>
                  <ArrowUpRight className="size-4" /> Escalate
                </Button>
                <Button size="sm" onClick={() => setResOpen(true)}>
                  <CheckCircle2 className="size-4" /> Close
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                  <Ban className="size-4" /> Cancel
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/disciplinary/${action._id}/edit`}>
                    <Pencil className="size-4" /> Edit
                  </Link>
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              {action.employee && (
                <Link
                  to={`/employees/${action.employee._id}`}
                  className="flex items-center gap-1 text-base font-semibold text-foreground hover:underline"
                >
                  {action.confidential && <Lock className="size-3 text-muted-foreground" />}
                  {action.employee.firstName} {action.employee.lastName}
                </Link>
              )}
              <p className="font-mono text-xs text-muted-foreground">
                {action.employee?.employeeId}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={STATUS_VARIANT[action.status]} className="capitalize">
                {action.status.replace('_', ' ')}
              </Badge>
              <Badge variant={SEVERITY_VARIANT[action.severity]} className="capitalize">
                {severityLabel}
              </Badge>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Detail label="Type" value={typeLabel} />
            <Detail label="Issued on" value={formatDate(action.issuedAt)} />
            {action.incidentDate && (
              <Detail label="Incident date" value={formatDate(action.incidentDate)} />
            )}
            {action.issuedBy && (
              <Detail
                label="Issued by"
                value={`${action.issuedBy.firstName} ${action.issuedBy.lastName}`}
              />
            )}
            {action.acknowledgedAt && (
              <Detail label="Acknowledged" value={formatDate(action.acknowledgedAt)} />
            )}
            {action.resolutionDate && (
              <Detail label="Closed on" value={formatDate(action.resolutionDate)} />
            )}
          </div>

          <div className="mt-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <p className="whitespace-pre-wrap text-sm">{action.description}</p>
          </div>

          {action.acknowledgementNotes && (
            <div className="mt-6 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Employee acknowledgement
              </p>
              <p className="whitespace-pre-wrap">{action.acknowledgementNotes}</p>
            </div>
          )}

          {action.escalatedAt && (
            <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                Escalated {formatDate(action.escalatedAt)}
                {action.escalatedTo
                  ? ` to ${action.escalatedTo.firstName} ${action.escalatedTo.lastName}`
                  : ''}
              </p>
              <p>{action.escalationReason}</p>
            </div>
          )}

          {action.resolutionNotes && (
            <div className="mt-6 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">
                Resolution
              </p>
              <p className="whitespace-pre-wrap">{action.resolutionNotes}</p>
            </div>
          )}
        </Card>

        {action.type === 'pip' && (
          <Card className="p-6">
            <h3 className="mb-4 text-base font-semibold">Performance Improvement Plan</h3>
            <div className="space-y-3 text-sm">
              {action.pipStartDate && (
                <Detail label="Start date" value={formatDate(action.pipStartDate)} />
              )}
              {action.pipEndDate && (
                <Detail label="End date" value={formatDate(action.pipEndDate)} />
              )}
              {action.pipGoals && (
                <div>
                  <p className="text-xs text-muted-foreground">Goals</p>
                  <p className="whitespace-pre-wrap text-sm">{action.pipGoals}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {action.type !== 'pip' && (
          <Card className="p-6">
            <h3 className="mb-4 text-base font-semibold">Timeline</h3>
            <div className="space-y-3 text-sm">
              <TimelineRow label="Issued" date={action.issuedAt} />
              {action.acknowledgedAt && (
                <TimelineRow label="Acknowledged" date={action.acknowledgedAt} />
              )}
              {action.escalatedAt && (
                <TimelineRow label="Escalated" date={action.escalatedAt} highlight />
              )}
              {action.resolutionDate && (
                <TimelineRow
                  label={action.status === 'cancelled' ? 'Cancelled' : 'Closed'}
                  date={action.resolutionDate}
                />
              )}
            </div>
          </Card>
        )}
      </div>

      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <MessageSquare className="size-4 text-muted-foreground" /> Notes &amp; comments
        </h3>
        {action.comments.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="mb-4 space-y-3">
            {action.comments.map((c, i) => {
              const author = typeof c.author === 'object' ? c.author : null;
              return (
                <li key={c._id ?? i} className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {author ? `${author.firstName} ${author.lastName}` : 'Unknown'}
                    </span>
                    <span>{formatRelative(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
                </li>
              );
            })}
          </ul>
        )}
        {!isClosed && (
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1"
            />
            <Button
              onClick={submitComment}
              disabled={!commentText.trim()}
              loading={addComment.isPending}
            >
              <Send className="size-4" /> Post
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={ackOpen} onClose={() => setAckOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Acknowledge case</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Record that the employee has been informed and acknowledges the action.
          </p>
          <div>
            <Label htmlFor="ack-notes">Acknowledgement notes</Label>
            <Textarea
              id="ack-notes"
              rows={3}
              value={ackNotes}
              onChange={(e) => setAckNotes(e.target.value)}
              placeholder="Optional — anything the employee wishes to add"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAckOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAcknowledge} loading={acknowledge.isPending}>
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={resOpen} onClose={() => setResOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Close case</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="res-out">Outcome *</Label>
            <Select
              id="res-out"
              value={resOutcome}
              onChange={(e) => setResOutcome(e.target.value as 'resolved' | 'failed')}
            >
              <option value="resolved">Resolved (positive outcome)</option>
              <option value="failed">Failed (escalation/exit required)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="res-notes">Resolution notes *</Label>
            <Textarea
              id="res-notes"
              rows={4}
              value={resNotes}
              onChange={(e) => setResNotes(e.target.value)}
              placeholder="Summarise the outcome, what changed, and any follow-up actions"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setResOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={!resNotes.trim()} loading={resolve.isPending}>
            Close case
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={escOpen} onClose={() => setEscOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Escalate case</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="esc-to">Escalate to *</Label>
            <Select id="esc-to" value={escTo} onChange={(e) => setEscTo(e.target.value)}>
              <option value="">Select a user</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName} {u.lastName} ({u.email})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="esc-reason">Reason *</Label>
            <Textarea
              id="esc-reason"
              rows={3}
              value={escReason}
              onChange={(e) => setEscReason(e.target.value)}
              placeholder="Why does this case need to be escalated?"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEscOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleEscalate}
            disabled={!escTo || !escReason.trim()}
            loading={escalate.isPending}
          >
            Escalate
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Cancel case</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Withdraws the case without resolution. Use this when the issue is dropped or was
            issued in error.
          </p>
          <div>
            <Label htmlFor="cn-reason">Reason</Label>
            <Textarea
              id="cn-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelOpen(false)}>
            Keep open
          </Button>
          <Button variant="outline" onClick={handleCancel} loading={cancel.isPending}>
            Confirm cancel
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

function TimelineRow({
  label,
  date,
  highlight,
}: {
  label: string;
  date: string;
  highlight?: boolean;
}): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          highlight
            ? 'mt-0.5 size-2 rounded-full bg-destructive'
            : 'mt-0.5 size-2 rounded-full bg-muted-foreground'
        }
      />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{formatDate(date)}</p>
      </div>
    </div>
  );
}
