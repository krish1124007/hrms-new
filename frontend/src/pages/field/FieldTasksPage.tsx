import { useState, type ReactElement } from 'react';
import { CheckCircle2, ClipboardList, Pencil, Play, Plus, ThumbsUp, Trash2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowActionsMenu, type RowAction } from '@/components/common/RowActionsMenu';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { ClientPicker } from '@/components/field/ClientPicker';
import { PhotoInput, PhotoStrip } from '@/components/field/FieldBits';
import {
  useAcceptFieldTask,
  useCanManageField,
  useCompleteFieldTask,
  useCreateFieldTask,
  useDeleteFieldTask,
  useFieldReps,
  useFieldTasks,
  useMyEmployeeId,
  useUpdateFieldTask,
} from '@/hooks/use-field';
import { usePermissions } from '@/hooks/use-permissions';
import { isNoEmployeeProfileError } from '@/lib/api-error';
import { businessInstant } from '@/lib/business-day';
import {
  personName,
  refId,
  type FieldTask,
  type FieldTaskInput,
  type FieldTaskUpdate,
  type FieldTaskPriority,
  type FieldTaskStatus,
} from '@/lib/field.api';
import { formatDate, toISTDateKey, todayIST } from '@/lib/format';

const PRIORITY_VARIANT: Record<FieldTaskPriority, 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'secondary',
  low: 'outline',
};
const STATUS_LABEL: Record<FieldTaskStatus, string> = {
  new: 'New',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const STATUS_VARIANT: Record<FieldTaskStatus, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  new: 'secondary',
  accepted: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
};
const CLOSED: FieldTaskStatus[] = ['completed', 'cancelled'];

interface FormState {
  title: string;
  description: string;
  assignedTo: string;
  clientId: string;
  clientName: string;
  priority: FieldTaskPriority;
  status: FieldTaskStatus;
  dueDate: string;
}
const blank: FormState = {
  title: '',
  description: '',
  assignedTo: '',
  clientId: '',
  clientName: '',
  priority: 'medium',
  status: 'new',
  dueDate: '',
};

/** A due day picked as an IST calendar day → end of that IST day. */
const dueInstant = (key: string): string => businessInstant(key, '23:59').toISOString();

export default function FieldTasksPage(): ReactElement {
  const canManage = useCanManageField();
  const myEmployeeId = useMyEmployeeId();
  const { has } = usePermissions();
  const { data: reps = [] } = useFieldReps(canManage && has('employees.view'));
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const { data, isLoading, error, refetch } = useFieldTasks({
    page,
    limit: 20,
    status: status || undefined,
    priority: priority || undefined,
    assignedTo: assignee || undefined,
    sort: 'dueDate',
  });
  const create = useCreateFieldTask();
  const update = useUpdateFieldTask();
  const remove = useDeleteFieldTask();
  const accept = useAcceptFieldTask();
  const complete = useCompleteFieldTask();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTask | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [completing, setCompleting] = useState<FieldTask | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionPhoto, setCompletionPhoto] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; t: FieldTask } | null>(null);

  const startCreate = (): void => {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  };
  const startEdit = (t: FieldTask): void => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? '',
      assignedTo: refId(t.assignedTo),
      clientId: t.clientId ? refId(t.clientId) : '',
      clientName: typeof t.clientId === 'object' && t.clientId ? t.clientId.name : '',
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate ? toISTDateKey(t.dueDate) : '',
    });
    setOpen(true);
  };

  const submit = (): void => {
    if (!form.title.trim() || !form.assignedTo) return;
    const input: FieldTaskInput = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      assignedTo: form.assignedTo,
      clientId: form.clientId || undefined,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate ? dueInstant(form.dueDate) : undefined,
    };
    if (editing) {
      // An emptied description, client or due date goes as `null`, so the server clears it.
      const changes: FieldTaskUpdate = {
        ...input,
        description: input.description ?? null,
        clientId: input.clientId ?? null,
        dueDate: input.dueDate ?? null,
      };
      update.mutate({ id: editing._id, input: changes }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(input, { onSuccess: () => setOpen(false) });
    }
  };

  const isMine = (t: FieldTask): boolean => !!myEmployeeId && refId(t.assignedTo) === myEmployeeId;
  const today = todayIST();

  const columns: DataTableColumn<FieldTask>[] = [
    {
      key: 'title',
      header: 'Task',
      cell: (r) => (
        <div className="max-w-xs">
          <div className="font-medium">{r.title}</div>
          {r.description && <div className="line-clamp-1 text-xs text-muted-foreground">{r.description}</div>}
          {typeof r.clientId === 'object' && r.clientId && (
            <div className="text-xs text-muted-foreground">Client: {r.clientId.name}</div>
          )}
        </div>
      ),
    },
    { key: 'assigned', header: 'Assigned to', cell: (r) => <span className="text-xs">{personName(r.assignedTo)}</span> },
    {
      key: 'priority',
      header: 'Priority',
      cell: (r) => <Badge variant={PRIORITY_VARIANT[r.priority] ?? 'secondary'}>{r.priority}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="space-y-1">
          <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
          {r.status === 'completed' && (r.completionNotes || r.completionPhotos?.length > 0) && (
            <div className="max-w-[200px] space-y-1 text-xs text-muted-foreground">
              {r.completionNotes && <div className="line-clamp-2">{r.completionNotes}</div>}
              <PhotoStrip urls={r.completionPhotos ?? []} size={28} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      cell: (r) => {
        if (!r.dueDate) return <span className="text-xs text-muted-foreground">—</span>;
        const overdue = !CLOSED.includes(r.status) && toISTDateKey(r.dueDate) < today;
        return <span className={overdue ? 'text-xs font-medium text-destructive' : 'text-xs'}>{formatDate(r.dueDate)}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      cell: (r) => {
        const closed = CLOSED.includes(r.status);
        const mine = isMine(r);
        const menu: RowAction[] = [];
        if (canManage && !closed) {
          menu.push({ label: 'Edit', icon: Pencil, onSelect: () => startEdit(r) });
          menu.push({ label: 'Cancel task', icon: XCircle, onSelect: () => setConfirm({ kind: 'cancel', t: r }), destructive: true });
        }
        if (canManage) menu.push({ label: 'Delete', icon: Trash2, onSelect: () => setConfirm({ kind: 'delete', t: r }), destructive: true });
        return (
          <div className="flex items-center justify-end gap-1">
            {mine && r.status === 'new' && (
              <button
                onClick={() => accept.mutate(r._id)}
                className="rounded p-1.5 text-primary hover:bg-primary/10"
                title="Accept"
                aria-label={`Accept ${r.title}`}
              >
                <ThumbsUp className="size-4" />
              </button>
            )}
            {mine && r.status === 'accepted' && (
              <button
                onClick={() => update.mutate({ id: r._id, input: { status: 'in_progress' } })}
                className="rounded p-1.5 text-warning hover:bg-warning/10"
                title="Start"
                aria-label={`Start ${r.title}`}
              >
                <Play className="size-4" />
              </button>
            )}
            {(mine || canManage) && !closed && (
              <button
                onClick={() => {
                  setCompleting(r);
                  setCompletionNotes('');
                  setCompletionPhoto('');
                }}
                className="rounded p-1.5 text-success hover:bg-success/10"
                title="Mark complete"
                aria-label={`Complete ${r.title}`}
              >
                <CheckCircle2 className="size-4" />
              </button>
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
        title="Field Tasks"
        description={canManage ? 'Assign work to reps and follow it to completion' : 'Work assigned to you'}
        icon={ClipboardList}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Tasks' }]}
        actions={
          canManage ? (
            <Button onClick={startCreate}>
              <Plus className="mr-2 size-4" />
              New task
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as FieldTaskStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Priority" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="w-36">
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        {reps.length > 0 && (
          <Select aria-label="Assignee" value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }} className="w-48">
            <option value="">Everyone</option>
            {reps.map((e) => (
              <option key={e._id} value={e._id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </Select>
        )}
      </div>

      {isNoEmployeeProfileError(error) ? (
        <NoEmployeeProfileNotice feature="tasks" />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            rowKey={(r) => r._id}
            emptyTitle="No tasks"
          />
          <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />
        </>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[75vh] space-y-3 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title *</Label>
            <Input id="task-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Assign to *</Label>
            <Select id="task-assignee" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">— Select a rep —</option>
              {form.assignedTo && !reps.some((r) => r._id === form.assignedTo) && editing && (
                <option value={form.assignedTo}>{personName(editing.assignedTo)}</option>
              )}
              {reps.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.firstName} {e.lastName}
                  {e.employeeId ? ` (${e.employeeId})` : ''}
                </option>
              ))}
            </Select>
          </div>
          <ClientPicker
            id="task-client"
            label="Client (optional)"
            value={form.clientId}
            selectedLabel={form.clientName}
            onChange={(id, name) => setForm({ ...form, clientId: id, clientName: name })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Select id="task-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as FieldTaskPriority })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            {editing && (
              <div className="space-y-1.5">
                <Label htmlFor="task-status">Status</Label>
                <Select id="task-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FieldTaskStatus })}>
                  <option value="new">New</option>
                  <option value="accepted">Accepted</option>
                  <option value="in_progress">In progress</option>
                </Select>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">The rep is notified when a task is assigned to them.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!form.title.trim() || !form.assignedTo}
          >
            {editing ? 'Save' : 'Assign task'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={completing !== null} onClose={() => setCompleting(null)} size="md">
        <DialogHeader>
          <DialogTitle>Complete “{completing?.title}”</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Completion notes</Label>
            <Textarea id="task-notes" rows={3} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} />
          </div>
          <PhotoInput value={completionPhoto} onChange={setCompletionPhoto} label="Photo (optional)" />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleting(null)}>
            Cancel
          </Button>
          <Button
            loading={complete.isPending}
            onClick={() =>
              completing &&
              complete.mutate(
                {
                  id: completing._id,
                  input: {
                    completionNotes: completionNotes.trim() || undefined,
                    completionPhotos: completionPhoto ? [completionPhoto] : undefined,
                  },
                },
                { onSuccess: () => setCompleting(null) },
              )
            }
          >
            <CheckCircle2 className="mr-2 size-4" />
            Mark complete
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={confirm?.kind === 'cancel'}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          confirm && update.mutate({ id: confirm.t._id, input: { status: 'cancelled' } }, { onSuccess: () => setConfirm(null) })
        }
        loading={update.isPending}
        title={`Cancel “${confirm?.t.title ?? ''}”?`}
        description="A cancelled task is closed and can no longer be changed."
        confirmLabel="Cancel task"
        cancelLabel="Keep task"
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.t._id, { onSuccess: () => setConfirm(null) })}
        loading={remove.isPending}
        title={`Delete “${confirm?.t.title ?? ''}”?`}
        description="The task disappears from the rep's list."
        confirmLabel="Delete task"
      />
    </div>
  );
}
