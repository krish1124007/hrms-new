import { useMemo, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileClock,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  listAuditLogs,
  listAuditEntities,
  type AuditAction,
  type AuditLog,
} from '@/lib/audit-logs.api';

const ACTIONS: { value: AuditAction | ''; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'export', label: 'Export' },
  { value: 'import', label: 'Import' },
];

const ACTION_STYLE: Record<AuditAction, string> = {
  create: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  update: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  delete: 'bg-red-500/10 text-red-600 dark:text-red-400',
  login: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  logout: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  export: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  import: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

function userName(u: AuditLog['userId']): string {
  if (!u || typeof u === 'string') return 'System';
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email || 'Unknown user';
}

export default function AuditLogsPage(): ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(search ? { search } : {}),
      ...(from ? { from: new Date(from).toISOString() } : {}),
      ...(to ? { to: new Date(to + 'T23:59:59').toISOString() } : {}),
    }),
    [page, action, entity, search, from, to],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => listAuditLogs(params),
    placeholderData: (prev) => prev,
  });

  const { data: entities } = useQuery({
    queryKey: ['audit-entities'],
    queryFn: listAuditEntities,
    staleTime: 5 * 60_000,
  });

  const applySearch = (): void => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = (): void => {
    setSearch('');
    setSearchInput('');
    setAction('');
    setEntity('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const hasFilters = !!(search || action || entity || from || to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Every change made across the workspace — who did what and when"
        icon={FileClock}
      />

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search entity or event..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                className="pl-9"
              />
            </div>
            <Select
              value={action}
              onChange={(e) => {
                setAction(e.target.value as AuditAction | '');
                setPage(1);
              }}
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
            <Select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All entities</option>
              {(entities ?? []).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              placeholder="From"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              placeholder="To"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={applySearch} size="sm">
              Apply
            </Button>
            {hasFilters && (
              <Button onClick={clearFilters} size="sm" variant="ghost">
                <X className="mr-1 size-4" />
                Clear filters
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {data?.pagination.total ?? 0} entries
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading && !data ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.data.length ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileClock className="size-8" />
              <p className="text-sm">No audit logs match your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">IP</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((log) => {
                    const u = log.userId && typeof log.userId === 'object' ? log.userId : null;
                    const event =
                      typeof log.metadata === 'object' && log.metadata && 'event' in log.metadata
                        ? String(log.metadata.event)
                        : '';
                    return (
                      <tr
                        key={log._id}
                        className="border-b last:border-0 hover:bg-accent/30"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={userName(log.userId)}
                              src={u?.avatar}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{userName(log.userId)}</div>
                              {u?.email && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {u.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="secondary"
                            className={cn('font-medium', ACTION_STYLE[log.action])}
                          >
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium">{log.entity}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {event || (log.entityId ? log.entityId.slice(-8) : '—')}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {log.ip ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setSelected(log)}
                            aria-label="View details"
                          >
                            <Eye className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && data.pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.pages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AuditLogDetailDialog log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AuditLogDetailDialog({
  log,
  onClose,
}: {
  log: AuditLog | null;
  onClose: () => void;
}): ReactElement {
  return (
    <Dialog open={!!log} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Audit log entry</DialogTitle>
      </DialogHeader>
      {log && (
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="When" value={new Date(log.createdAt).toLocaleString()} />
            <Field label="Action" value={log.action} />
            <Field label="Entity" value={log.entity} />
            <Field label="Entity ID" value={log.entityId ?? '—'} mono />
            <Field label="User" value={userName(log.userId)} />
            <Field label="IP" value={log.ip ?? '—'} mono />
          </div>

          {log.userAgent && (
            <Field label="User Agent" value={log.userAgent} mono full />
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Metadata
              </p>
              <pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}

          {log.changes && (log.changes.before || log.changes.after) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {log.changes.before && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Before
                  </p>
                  <pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                    {JSON.stringify(log.changes.before, null, 2)}
                  </pre>
                </div>
              )}
              {log.changes.after && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    After
                  </p>
                  <pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                    {JSON.stringify(log.changes.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogBody>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Field({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}): ReactElement {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-0.5 break-words', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}
