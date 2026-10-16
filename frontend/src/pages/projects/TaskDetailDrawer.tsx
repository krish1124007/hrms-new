import { useEffect, useState, type ReactElement } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useUpdateTask, useDeleteTask } from '@/hooks/use-pmcore';
import type { Task, TaskStatus, Priority } from '@/lib/pmcore.api';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  task: Task | null;
  onClose: () => void;
}

export function TaskDetailDrawer({ projectId, task, onClose }: Props): ReactElement | null {
  const update = useUpdateTask(projectId);
  const remove = useDeleteTask(projectId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState<number | ''>('');
  const [labels, setLabels] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
      setEstimatedHours(task.estimatedHours ?? '');
      setLabels(task.labels.join(', '));
    }
  }, [task]);

  if (!task) return null;

  const onSave = (): void => {
    update.mutate(
      {
        id: task._id,
        input: {
          title,
          description,
          status,
          priority,
          dueDate: dueDate || undefined,
          estimatedHours: estimatedHours === '' ? undefined : Number(estimatedHours),
          labels: labels
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean),
        },
      },
      { onSuccess: () => onClose() },
    );
  };

  const onDelete = (): void => {
    if (!confirm('Delete this task?')) return;
    remove.mutate(task._id, { onSuccess: () => onClose() });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-xl',
          'animate-in slide-in-from-right',
        )}
      >
        <header className="flex items-start justify-between border-b border-border p-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono text-muted-foreground">Task</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{task.title}</h2>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary">{task.status.replace('_', ' ')}</Badge>
              <Badge variant="default">{task.priority}</Badge>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-status">Status</Label>
              <Select
                id="t-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="t-prio">Priority</Label>
              <Select
                id="t-prio"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="t-due">Due date</Label>
              <Input
                id="t-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="t-est">Est. hours</Label>
              <Input
                id="t-est"
                type="number"
                step="0.5"
                value={estimatedHours}
                onChange={(e) =>
                  setEstimatedHours(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="t-labels">Labels (comma-separated)</Label>
              <Input
                id="t-labels"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="frontend, urgent"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Created:</span>{' '}
              {new Date(task.createdAt).toLocaleString('en-IN')}
            </p>
            <p className="mt-1">
              <span className="font-medium text-foreground">Updated:</span>{' '}
              {new Date(task.updatedAt).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-border p-4">
          <Button variant="outline" size="sm" onClick={onDelete} loading={remove.isPending}>
            <Trash2 className="size-4" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={update.isPending}>
              <Save className="size-4" /> Save
            </Button>
          </div>
        </footer>
      </aside>
    </>
  );
}
