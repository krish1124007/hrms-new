import { useMemo, useState, type DragEvent, type ReactElement } from 'react';
import { Plus, Calendar, GripVertical } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTasks, useCreateTask, useUpdateTaskStatus } from '@/hooks/use-pmcore';
import type { Task, TaskStatus, Priority } from '@/lib/pmcore.api';
import { cn } from '@/lib/utils';

const COLUMNS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: 'todo', label: 'To Do', tone: 'border-t-gray-400' },
  { key: 'in_progress', label: 'In Progress', tone: 'border-t-blue-500' },
  { key: 'in_review', label: 'In Review', tone: 'border-t-amber-500' },
  { key: 'done', label: 'Done', tone: 'border-t-success' },
];

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-gray-400',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
};

function TaskCard({
  task,
  onDragStart,
  onClick,
}: {
  task: Task;
  onDragStart: (e: DragEvent<HTMLDivElement>, task: Task) => void;
  onClick: (task: Task) => void;
}): ReactElement {
  const assigneeName = task.assignee
    ? `${task.assignee.firstName} ${task.assignee.lastName}`
    : null;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
      className="group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-foreground">{task.title}</p>
          {task.labels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.labels.slice(0, 3).map((l) => (
                <span
                  key={l}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={cn('size-2 rounded-full', PRIORITY_DOT[task.priority])} />
              {task.dueDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {new Date(task.dueDate).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
            {assigneeName && <Avatar name={assigneeName} size="sm" />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function KanbanBoard({
  projectId,
  onTaskClick,
}: {
  projectId: string;
  onTaskClick: (task: Task) => void;
}): ReactElement {
  const { data, isLoading } = useTasks(projectId);
  const updateStatus = useUpdateTaskStatus(projectId);
  const createTask = useCreateTask(projectId);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], in_review: [], done: [] };
    (data?.data ?? []).forEach((t) => {
      map[t.status].push(t);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.order - b.order));
    return map;
  }, [data]);

  const onDragStart = (e: DragEvent<HTMLDivElement>, task: Task): void => {
    e.dataTransfer.setData('text/plain', task._id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>, status: TaskStatus): void => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const task = (data?.data ?? []).find((t) => t._id === id);
    if (!task || task.status === status) return;
    updateStatus.mutate({ id, status });
  };

  const submitNew = (status: TaskStatus): void => {
    if (!newTitle.trim()) {
      setAdding(null);
      return;
    }
    createTask.mutate(
      { title: newTitle.trim(), status, priority: 'medium' },
      {
        onSuccess: () => {
          setNewTitle('');
          setAdding(null);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((c) => (
          <div key={c.key} className="h-96 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.key];
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.key);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, col.key)}
            className={cn(
              'flex min-h-[24rem] flex-col rounded-lg border border-t-4 border-border bg-muted/30 p-3 transition-colors',
              col.tone,
              dragOver === col.key && 'bg-primary/5 ring-2 ring-primary/30',
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <button
                onClick={() => setAdding(col.key)}
                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {items.map((t) => (
                <TaskCard key={t._id} task={t} onDragStart={onDragStart} onClick={onTaskClick} />
              ))}

              {adding === col.key && (
                <div className="rounded-lg border border-border bg-card p-2 shadow-sm">
                  <Input
                    autoFocus
                    placeholder="Task title…"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitNew(col.key);
                      if (e.key === 'Escape') {
                        setAdding(null);
                        setNewTitle('');
                      }
                    }}
                  />
                  <div className="mt-2 flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdding(null);
                        setNewTitle('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => submitNew(col.key)}
                      loading={createTask.isPending}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
