import type { ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Database,
  Download,
  ArchiveRestore,
  Trash2,
  Plus,
  HardDrive,
  CheckCircle2,
  XCircle,
  Loader2,
  CalendarClock,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { usePermissions } from '@/hooks/use-permissions';
import { backupsApi, saveBlob, type BackupRow } from '@/lib/backups.api';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';

const STATUS_CONFIG: Record<
  BackupRow['status'],
  { icon: ReactElement; variant: 'default' | 'success' | 'warning' | 'destructive'; label: string }
> = {
  completed: {
    icon: <CheckCircle2 className="size-3.5" />,
    variant: 'success',
    label: 'Completed',
  },
  in_progress: {
    icon: <Loader2 className="size-3.5 animate-spin" />,
    variant: 'warning',
    label: 'In progress',
  },
  failed: {
    icon: <XCircle className="size-3.5" />,
    variant: 'destructive',
    label: 'Failed',
  },
};

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A backup time on the IST clock (the server's schedule runs on IST too). */
function formatWhen(s?: string | number): string {
  if (s === undefined || s === '') return '—';
  return formatDateTime(s);
}

export default function BackupsPage(): ReactElement {
  const qc = useQueryClient();
  // Viewing needs `backups.view` (route guard); every action needs `backups.manage`.
  const { has } = usePermissions();
  const canManage = has('backups.manage');

  const { data: backups = [], isLoading } = useQuery<BackupRow[]>({
    queryKey: ['backups'],
    queryFn: backupsApi.list,
    // Poll while any backup is still running so the UI updates without a refresh.
    refetchInterval: (q) =>
      Array.isArray(q.state.data) && q.state.data.some((b) => b.status === 'in_progress')
        ? 3000
        : false,
  });

  const { data: schedule } = useQuery({
    queryKey: ['backup-schedule'],
    queryFn: backupsApi.getSchedule,
  });

  // Errors on every mutation below are toasted (with the server's message) by
  // the global MutationCache handler in main.tsx.
  const create = useMutation({
    mutationFn: () => backupsApi.create({ type: 'database' }),
    onSuccess: () => {
      toast.success('Backup queued — will complete in a few minutes');
      void qc.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const download = useMutation({
    mutationFn: (backup: BackupRow) => backupsApi.download(backup),
    onSuccess: (file) => saveBlob(file),
  });

  const restore = useMutation({
    mutationFn: (id: string) => backupsApi.restore(id),
    onSuccess: () => {
      toast.success('Restore queued into the scratch database — inspect it before any further action.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => backupsApi.delete(id),
    onSuccess: () => {
      toast.success('Backup deleted');
      void qc.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const toggleSchedule = useMutation({
    mutationFn: (enabled: boolean) => backupsApi.setSchedule(enabled),
    onSuccess: (data) => {
      toast.success(data.enabled ? 'Auto-backup enabled' : 'Auto-backup disabled');
      void qc.invalidateQueries({ queryKey: ['backup-schedule'] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backups"
        description="Database backups & data recovery"
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Backups' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => create.mutate()} loading={create.isPending}>
              <Plus className="size-4" /> Backup now
            </Button>
          ) : undefined
        }
      />

      {/* Schedule card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                schedule?.enabled
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <CalendarClock className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Monthly auto-backup</h3>
                <Badge variant={schedule?.enabled ? 'success' : 'secondary'}>
                  {schedule?.enabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {schedule?.enabled
                  ? `Runs automatically late on the last day of every month.${
                      schedule.nextRun
                        ? ` Next run: ${formatWhen(schedule.nextRun)} IST.`
                        : ''
                    }`
                  : 'Database is not being backed up automatically. Enable to run a backup at the end of every month.'}
              </p>
            </div>
          </div>
          {canManage && (
            <Button
              variant={schedule?.enabled ? 'outline' : 'default'}
              onClick={() => toggleSchedule.mutate(!schedule?.enabled)}
              loading={toggleSchedule.isPending}
              size="sm"
            >
              <Zap className="size-4" />
              {schedule?.enabled ? 'Disable' : 'Enable'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Backup list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : backups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Database className="mb-3 size-12 text-muted-foreground" />
          <p className="text-sm font-medium">No backups yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click "Backup now" to create your first one, or wait for the next scheduled run.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Started</th>
                <th className="px-4 py-3 text-left font-medium">Completed</th>
                {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => {
                const statusCfg = STATUS_CONFIG[backup.status];
                return (
                  <tr
                    key={backup._id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <HardDrive className="size-4 text-muted-foreground" />
                        <span className="font-medium capitalize">{backup.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={backup.trigger === 'scheduled' ? 'default' : 'outline'}
                        className="capitalize"
                      >
                        {backup.trigger === 'scheduled' ? (
                          <>
                            <CalendarClock className="mr-1 size-3" /> Scheduled
                          </>
                        ) : (
                          'Manual'
                        )}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusCfg.variant} className="gap-1">
                        {statusCfg.icon}
                        {statusCfg.label}
                      </Badge>
                      {backup.status === 'failed' && backup.error && (
                        <p
                          className="mt-1 max-w-md truncate text-xs text-destructive"
                          title={backup.error}
                        >
                          {backup.error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatBytes(backup.size)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatWhen(backup.startedAt ?? backup.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatWhen(backup.completedAt)}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {backup.downloadUrl && (
                            <>
                              <button
                                type="button"
                                onClick={() => download.mutate(backup)}
                                disabled={download.isPending}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                                title="Download"
                                aria-label="Download backup"
                              >
                                {download.isPending && download.variables?._id === backup._id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Download className="size-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    confirm(
                                      'Restore this backup into the scratch database configured on the server? The live database is not touched.',
                                    )
                                  )
                                    restore.mutate(backup._id);
                                }}
                                disabled={restore.isPending}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                                title="Restore to scratch database"
                                aria-label="Restore backup to scratch database"
                              >
                                <ArchiveRestore className="size-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Delete this backup? The file will be removed from storage.'))
                                remove.mutate(backup._id);
                            }}
                            disabled={remove.isPending}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Delete"
                            aria-label="Delete backup"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
