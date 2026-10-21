import { useEffect, useState, type ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Megaphone,
  Plus,
  Pin,
  CheckCircle2,
  Clock,
  Search,
  AlertTriangle,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissions } from '@/hooks/use-permissions';
import { useDepartments } from '@/hooks/use-systemcore';
import { RichText } from '@/components/common/RichText';
import { noticesApi, NOTICE_PRIORITIES, type Notice, type NoticePriority } from '@/lib/notices.api';
import { formatRelative } from '@/lib/format';
import { apiErrorMessage } from '@/lib/api-error';
import { Pagination } from '@/components/ui/data-table';

const PAGE_SIZE = 20;
import { cn } from '@/lib/utils';

const PRIORITY_STYLES: Record<NoticePriority, { border: string; icon: ReactElement; label: string }> = {
  normal: {
    border: 'border-border',
    icon: <Megaphone className="size-4 text-muted-foreground" />,
    label: 'Normal',
  },
  important: {
    border: 'border-warning/40',
    icon: <AlertTriangle className="size-4 text-warning" />,
    label: 'Important',
  },
  urgent: {
    border: 'border-destructive/40',
    icon: <AlertCircle className="size-4 text-destructive" />,
    label: 'Urgent',
  },
};

const createSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  content: z.string().min(1, 'Body required').max(20000),
  priority: z.enum(['normal', 'important', 'urgent']),
  isPinned: z.boolean(),
  expiresAt: z.string().optional(),
  /** Empty = every employee. */
  departments: z.array(z.string()),
});
type CreateValues = z.infer<typeof createSchema>;

export default function NoticeBoardPage(): ReactElement {
  const qc = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?._id);
  const { has } = usePermissions();
  // Posting, editing and deleting notices is `notices.manage` on the API.
  const canManage = has('notices.manage');

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  // Paged on the server (the API's default page used to be all you saw). A
  // new search starts again at page 1.
  const [paging, setPaging] = useState({ search, page: 1 });
  const page = paging.search === search ? paging.page : 1;
  const setPage = (p: number): void => setPaging({ search, page: p });
  const { data, isLoading, error } = useQuery({
    queryKey: ['notices', search, page],
    queryFn: () => noticesApi.list({ ...(search ? { search } : {}), page, limit: PAGE_SIZE }),
  });

  const create = useMutation({
    mutationFn: (input: CreateValues) =>
      noticesApi.create({
        ...input,
        expiresAt: input.expiresAt || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Notice posted');
      setOpen(false);
      reset({ priority: 'normal', isPinned: false, title: '', content: '', expiresAt: '', departments: [] });
    },
  });

  const ack = useMutation({
    mutationFn: (id: string) => noticesApi.acknowledge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Marked as read');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => noticesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Notice deleted');
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { priority: 'normal', isPinned: false, title: '', content: '', departments: [] },
  });

  // Department targeting — loaded only when the post form is open.
  const { data: deptData } = useDepartments({ limit: 100 }, { enabled: canManage && open });
  const departments = deptData?.data ?? [];
  const chosenDepartments = watch('departments') ?? [];
  const toggleDepartment = (id: string, on: boolean): void => {
    setValue(
      'departments',
      on ? [...chosenDepartments, id] : chosenDepartments.filter((d) => d !== id),
      { shouldDirty: true },
    );
  };

  const onSubmit = (values: CreateValues): void => create.mutate(values);

  const notices = data?.data ?? [];

  // Notification links point at /notices/:id. Rather than a separate detail
  // page, the board scrolls to that notice and highlights it — previously the
  // route did not exist at all and every notice notification hit a 404.
  const { id: focusId } = useParams<{ id: string }>();
  useEffect(() => {
    if (!focusId || notices.length === 0) return;
    document
      .getElementById(`notice-${focusId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, notices.length]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notice Board"
        description="Company announcements and updates"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Notice Board' }]}
        actions={
          canManage && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Post Notice
            </Button>
          )
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search notices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="max-w-3xl rounded-lg border border-dashed border-destructive/40 py-12 text-center text-sm">
          <p className="font-medium text-foreground">Couldn't load notices</p>
          <p className="mt-1 text-muted-foreground">{apiErrorMessage(error)}</p>
        </div>
      ) : notices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Megaphone className="mb-3 size-12 text-muted-foreground" />
          <p className="text-sm font-medium">No notices posted</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canManage
              ? 'Click "Post Notice" to share an announcement with the team'
              : 'Announcements from HR / management will appear here'}
          </p>
        </div>
      ) : (
        <div className="max-w-3xl space-y-4">
          {notices.map((notice) => (
            <div
              key={notice._id}
              id={`notice-${notice._id}`}
              className={
                notice._id === focusId
                  ? 'rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : undefined
              }
            >
              <NoticeCard
                notice={notice}
                currentUserId={currentUserId}
                canManage={canManage}
                onAck={() => ack.mutate(notice._id)}
                onDelete={() => {
                  if (confirm(`Delete notice "${notice.title}"?`)) remove.mutate(notice._id);
                }}
                ackPending={ack.isPending}
              />
            </div>
          ))}
          <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Post a notice</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="n-title">Title *</Label>
              <Input id="n-title" placeholder="e.g., Office closed for Diwali" {...register('title')} />
              {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div>
              <Label htmlFor="n-body">Body *</Label>
              <Textarea
                id="n-body"
                rows={6}
                placeholder="Write the announcement here. Basic HTML (bold, lists, links) is allowed."
                {...register('content')}
              />
              {errors.content && (
                <p className="mt-1 text-xs text-destructive">{errors.content.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="n-prio">Priority</Label>
                <Select id="n-prio" {...register('priority')}>
                  {NOTICE_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="n-expires">Expires on</Label>
                <Input id="n-expires" type="date" {...register('expiresAt')} />
              </div>
            </div>
            <div>
              <Label>Audience</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {chosenDepartments.length === 0
                  ? 'Everyone — tick departments to limit who sees it.'
                  : `Only ${chosenDepartments.length} selected department${chosenDepartments.length === 1 ? '' : 's'}.`}
              </p>
              <div className="grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                {departments.length === 0 ? (
                  <p className="col-span-2 text-xs text-muted-foreground">No departments to choose from.</p>
                ) : (
                  departments.map((d) => (
                    <label key={d._id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={chosenDepartments.includes(d._id)}
                        onChange={(e) => toggleDepartment(d._id, e.target.checked)}
                      />
                      <span className="truncate">{d.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('isPinned')} />
              <Pin className="size-3.5 text-muted-foreground" />
              Pin to top of the board
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Post notice
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

function NoticeCard({
  notice,
  currentUserId,
  canManage,
  onAck,
  onDelete,
  ackPending,
}: {
  notice: Notice;
  currentUserId?: string;
  canManage: boolean;
  onAck: () => void;
  onDelete: () => void;
  ackPending: boolean;
}): ReactElement {
  const priority = PRIORITY_STYLES[notice.priority];
  const hasRead =
    notice.acknowledgedByMe ?? notice.acknowledgements?.some((a) => a.userId === currentUserId) ?? false;
  const ackCount = notice.acknowledgements?.length ?? 0;

  return (
    <div
      className={cn(
        'relative rounded-lg border-2 bg-card p-5 transition-shadow hover:shadow-sm',
        priority.border,
      )}
    >
      {notice.isPinned && (
        <div className="absolute -top-2 right-4">
          <div className="flex size-6 items-center justify-center rounded-full bg-primary shadow-sm">
            <Pin className="size-3 text-primary-foreground" />
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            {priority.icon}
            <h3 className="text-base font-semibold">{notice.title}</h3>
            {notice.priority !== 'normal' && (
              <Badge
                variant={notice.priority === 'urgent' ? 'destructive' : 'warning'}
                className="text-[10px]"
              >
                {priority.label}
              </Badge>
            )}
          </div>
          <RichText source={notice.content} format="html" className="text-sm text-muted-foreground" />
        </div>
        {canManage && (
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {notice.postedBy.firstName} {notice.postedBy.lastName}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatRelative(notice.createdAt)}
          </span>
          {notice.departments.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {notice.departments.map((d) => d.name).join(', ')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{ackCount} read</span>
          {hasRead ? (
            <Badge variant="success" className="gap-1 text-[10px]">
              <CheckCircle2 className="size-3" />
              Read
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={onAck}
              loading={ackPending}
            >
              <CheckCircle2 className="size-3" />
              I've read this
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
