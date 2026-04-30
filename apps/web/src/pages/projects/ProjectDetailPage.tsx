import { useState, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, Circle, Plus, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useProject,
  useProjectDashboard,
  useMilestones,
  useCreateMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  useTimeEntries,
  useCreateTimeEntry,
  useDeleteTimeEntry,
} from '@/hooks/use-pmcore';
import type { Task as PMTask } from '@/lib/pmcore.api';
import { KanbanBoard } from './KanbanBoard';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { cn } from '@/lib/utils';

function ProgressRing({ value, color }: { value: number; color: string }): ReactElement {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg className="size-20 -rotate-90" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} className="fill-none stroke-muted" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all"
      />
    </svg>
  );
}

function MilestonesPanel({ projectId }: { projectId: string }): ReactElement {
  const { data, isLoading } = useMilestones(projectId);
  const create = useCreateMilestone(projectId);
  const update = useUpdateMilestone(projectId);
  const remove = useDeleteMilestone(projectId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  const submit = (): void => {
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), dueDate: dueDate || undefined, description },
      {
        onSuccess: () => {
          setTitle('');
          setDueDate('');
          setDescription('');
          setOpen(false);
        },
      },
    );
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Milestones</h3>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No milestones yet</p>
        ) : (
          <ul className="space-y-3">
            {(data?.data ?? []).map((m) => {
              const done = m.status === 'completed';
              return (
                <li key={m._id} className="flex items-start gap-3">
                  <button
                    onClick={() =>
                      update.mutate({
                        id: m._id,
                        input: { status: done ? 'pending' : 'completed' },
                      })
                    }
                    className="mt-0.5 text-muted-foreground hover:text-success"
                  >
                    {done ? (
                      <CheckCircle2 className="size-5 text-success" />
                    ) : (
                      <Circle className="size-5" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        done && 'text-muted-foreground line-through',
                      )}
                    >
                      {m.title}
                    </p>
                    {m.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    )}
                    {m.dueDate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Due {new Date(m.dueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Delete milestone?')) remove.mutate(m._id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader>
          <DialogTitle>New milestone</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="m-title">Title *</Label>
            <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="m-due">Due date</Label>
            <Input
              id="m-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="m-desc">Description</Label>
            <Textarea
              id="m-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Add
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

function TimeEntriesPanel({ projectId }: { projectId: string }): ReactElement {
  const { data, isLoading } = useTimeEntries(projectId);
  const create = useCreateTimeEntry(projectId);
  const remove = useDeleteTimeEntry(projectId);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState<number>(1);
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(true);

  const total = (data?.data ?? []).reduce((s, e) => s + e.hours, 0);

  const submit = (): void => {
    create.mutate(
      { date, hours, description, isBillable: billable },
      {
        onSuccess: () => {
          setHours(1);
          setDescription('');
          setOpen(false);
        },
      },
    );
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Time entries</h3>
            <p className="text-xs text-muted-foreground">Total {total.toFixed(1)} h logged</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Log time
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No time logged yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left text-xs font-semibold uppercase text-muted-foreground">
                <th className="py-2">Date</th>
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Hours</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((e) => (
                <tr key={e._id} className="border-b border-border last:border-0">
                  <td className="py-2 font-mono text-xs">
                    {new Date(e.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </td>
                  <td className="py-2 text-muted-foreground">{e.description ?? '—'}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{e.hours.toFixed(1)}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => {
                        if (confirm('Remove entry?')) remove.mutate(e._id);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Log time</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="te-date">Date *</Label>
              <Input
                id="te-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="te-hours">Hours *</Label>
              <Input
                id="te-hours"
                type="number"
                step="0.25"
                min="0.25"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="te-desc">Description</Label>
            <Textarea
              id="te-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            Billable
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Log
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

function MembersPanel({
  members,
}: {
  members: { userId: { _id: string; firstName: string; lastName: string; email: string; avatar?: string } | string; role: string }[];
}): ReactElement {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-4 font-semibold">Members ({members.length})</h3>
        {members.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No members yet</p>
        ) : (
          <ul className="space-y-3">
            {members.map((m, i) => {
              if (typeof m.userId === 'string') {
                return (
                  <li key={i} className="text-sm text-muted-foreground">
                    {m.userId} — {m.role}
                  </li>
                );
              }
              const fullName = `${m.userId.firstName} ${m.userId.lastName}`;
              return (
                <li key={m.userId._id} className="flex items-center gap-3">
                  <Avatar src={m.userId.avatar} name={fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.userId.email}</p>
                  </div>
                  <Badge variant="secondary">{m.role}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const { data: projectRes, isLoading } = useProject(id);
  const { data: dashRes } = useProjectDashboard(id);
  const [activeTask, setActiveTask] = useState<PMTask | null>(null);

  if (isLoading || !projectRes) {
    return <Skeleton className="h-64 w-full" />;
  }

  const p = projectRes.data;
  const dash = dashRes?.data;

  const taskCounts: Record<string, number> = {};
  dash?.taskStats.forEach((s) => {
    taskCounts[s._id] = s.n;
  });
  const totalTasks = Object.values(taskCounts).reduce((a, b) => a + b, 0);
  const doneTasks = taskCounts.done ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.name}
        description={p.description}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Projects', to: '/projects' },
          { label: p.code },
        ]}
        actions={
          <Link to="/projects">
            <Button variant="outline" size="sm">
              Back
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-5">
          <div className="relative">
            <ProgressRing value={p.progress} color={p.color} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold">{p.progress}%</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{p.status.replace('_', ' ')}</Badge>
              <Badge variant="default">{p.priority}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Tasks</p>
                <p className="font-semibold">
                  {doneTasks} / {totalTasks}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hours logged</p>
                <p className="font-semibold">{(dash?.totalHours ?? 0).toFixed(1)} h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Members</p>
                <p className="flex items-center gap-1 font-semibold">
                  <Users className="size-4" /> {p.members.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">End date</p>
                <p className="font-semibold">
                  {p.endDate
                    ? new Date(p.endDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MilestonesPanel projectId={p._id} />
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 font-semibold">Project info</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Start date</dt>
                  <dd>
                    {p.startDate
                      ? new Date(p.startDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">End date</dt>
                  <dd>
                    {p.endDate
                      ? new Date(p.endDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Estimated hours</dt>
                  <dd>{p.estimatedHours ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Budget</dt>
                  <dd>{p.budget ? `₹${p.budget.toLocaleString('en-IN')}` : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd>{p.category ?? '—'}</dd>
                </div>
              </dl>
              {p.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <KanbanBoard projectId={p._id} onTaskClick={setActiveTask} />
        </TabsContent>

        <TabsContent value="time">
          <TimeEntriesPanel projectId={p._id} />
        </TabsContent>

        <TabsContent value="members">
          <MembersPanel members={p.members} />
        </TabsContent>
      </Tabs>

      <TaskDetailDrawer projectId={p._id} task={activeTask} onClose={() => setActiveTask(null)} />
    </div>
  );
}
