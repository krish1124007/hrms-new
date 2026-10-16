import { useState, type ReactElement } from 'react';
import { Plus, Trash2, Pencil, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useFieldTasks,
  useCreateFieldTask,
  useUpdateFieldTask,
  useDeleteFieldTask,
  useCompleteFieldTask,
} from '@/hooks/use-field';
import { useEmployees } from '@/hooks/use-systemcore';
import type {
  FieldTask,
  FieldTaskInput,
  FieldTaskPriority,
  FieldTaskStatus,
} from '@/lib/field.api';

const blank: FieldTaskInput = {
  title: '',
  description: '',
  assignedTo: '',
  priority: 'medium',
  status: 'new',
};

export default function FieldTasksPage(): ReactElement {
  const { data, isLoading } = useFieldTasks();
  const { data: empData } = useEmployees({ limit: 200 });
  const create = useCreateFieldTask();
  const update = useUpdateFieldTask();
  const remove = useDeleteFieldTask();
  const complete = useCompleteFieldTask();

  const employees = empData?.data ?? [];

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FieldTaskInput>(blank);

  const startCreate = (): void => {
    setEditingId(null);
    setForm(blank);
    setOpen(true);
  };

  const startEdit = (t: FieldTask): void => {
    setEditingId(t._id);
    setForm({
      title: t.title,
      description: t.description,
      assignedTo: typeof t.assignedTo === 'object' ? t.assignedTo._id : t.assignedTo,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.slice(0, 10) : undefined,
    });
    setOpen(true);
  };

  const submit = (): void => {
    if (editingId) {
      update.mutate({ id: editingId, input: form }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(form, { onSuccess: () => setOpen(false) });
    }
  };

  const columns: DataTableColumn<FieldTask>[] = [
    {
      key: 'title',
      header: 'Task',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.title}</div>
          {r.description && (
            <div className="line-clamp-1 text-xs text-muted-foreground">
              {r.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'assigned',
      header: 'Assigned To',
      cell: (r) =>
        typeof r.assignedTo === 'object'
          ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}`
          : '—',
    },
    {
      key: 'priority',
      header: 'Priority',
      cell: (r) => (
        <Badge
          variant={
            r.priority === 'urgent'
              ? 'destructive'
              : r.priority === 'high'
                ? 'warning'
                : 'secondary'
          }
        >
          {r.priority}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge
          variant={
            r.status === 'completed'
              ? 'success'
              : r.status === 'cancelled'
                ? 'destructive'
                : 'secondary'
          }
        >
          {r.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      cell: (r) => (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'),
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.status !== 'completed' && (
            <button
              onClick={() => complete.mutate({ id: r._id, input: {} })}
              className="rounded p-1.5 text-success hover:bg-success/10"
              title="Mark complete"
            >
              <CheckCircle2 className="size-4" />
            </button>
          )}
          <button
            onClick={() => startEdit(r)}
            className="rounded p-1.5 hover:bg-muted"
          >
            <Pencil className="size-4" />
          </button>
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
        title="Field Tasks"
        description="Assign and track field tasks"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Tasks' },
        ]}
        actions={
          <Button onClick={startCreate}>
            <Plus className="mr-2 size-4" />
            New Task
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No tasks"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit task' : 'New task'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="assigned">Assign to *</Label>
            <Select
              id="assigned"
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            >
              <option value="">— Select employee —</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                id="priority"
                value={form.priority ?? 'medium'}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as FieldTaskPriority })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={form.status ?? 'new'}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as FieldTaskStatus })
                }
              >
                <option value="new">New</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="due">Due date</Label>
            <Input
              id="due"
              type="date"
              value={form.dueDate ?? ''}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!form.title || !form.assignedTo}
          >
            {editingId ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
