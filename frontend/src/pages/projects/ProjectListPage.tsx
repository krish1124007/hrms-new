import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Calendar, Users, FolderKanban } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProjects, useCreateProject } from '@/hooks/use-pmcore';
import type { Project, ProjectStatus, Priority } from '@/lib/pmcore.api';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<ProjectStatus, 'success' | 'warning' | 'secondary' | 'default' | 'destructive'> = {
  not_started: 'secondary',
  in_progress: 'default',
  on_hold: 'warning',
  completed: 'success',
  cancelled: 'destructive',
};

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-gray-400',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
};

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled']).default('not_started'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  color: z.string().default('#3b82f6'),
});
type FormValues = z.infer<typeof schema>;

function ProjectCard({ p }: { p: Project }): ReactElement {
  const memberCount = p.members?.length ?? 0;
  return (
    <Link to={`/projects/${p._id}`}>
      <Card className="h-full transition-shadow hover:shadow-elevated">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="rounded-lg p-2 text-white"
                style={{ backgroundColor: p.color }}
              >
                <FolderKanban className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{p.name}</h3>
                <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[p.status]}>{p.status.replace('_', ' ')}</Badge>
          </div>

          {p.description && (
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
          )}

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{p.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${p.progress}%`, backgroundColor: p.color }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Users className="size-3.5" />
                {memberCount}
              </span>
              {p.endDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  {new Date(p.endDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <span className={cn('size-2 rounded-full', PRIORITY_DOT[p.priority])} title={p.priority} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ProjectListPage(): ReactElement {
  const [status, setStatus] = useState<string>('');
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useProjects({ limit: 50, ...(status ? { status } : {}) });
  const create = useCreateProject();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'not_started', priority: 'medium', color: '#3b82f6' },
  });

  const openCreate = (): void => {
    reset({
      name: '',
      code: '',
      description: '',
      status: 'not_started',
      priority: 'medium',
      color: '#3b82f6',
    });
    setOpen(true);
  };

  const onSubmit = (values: FormValues): void => {
    create.mutate(values, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage projects, milestones and tasks"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Projects' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Project
          </Button>
        }
      />

      <div className="flex gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          <option value="">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : !data?.data || data.data.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to get started"
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" /> New Project
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((p) => (
            <ProjectCard key={p._id} p={p} />
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="p-name">Name *</Label>
                <Input id="p-name" {...register('name')} />
                {errors.name && (
                  <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="p-code">Code *</Label>
                <Input id="p-code" placeholder="PROJ-1" {...register('code')} />
              </div>
              <div>
                <Label htmlFor="p-color">Color</Label>
                <Input id="p-color" type="color" className="h-10 p-1" {...register('color')} />
              </div>
              <div>
                <Label htmlFor="p-status">Status</Label>
                <Select id="p-status" {...register('status')}>
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="on_hold">On hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-priority">Priority</Label>
                <Select id="p-priority" {...register('priority')}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-start">Start date</Label>
                <Input id="p-start" type="date" {...register('startDate')} />
              </div>
              <div>
                <Label htmlFor="p-end">End date</Label>
                <Input id="p-end" type="date" {...register('endDate')} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="p-desc">Description</Label>
                <Textarea id="p-desc" rows={3} {...register('description')} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
