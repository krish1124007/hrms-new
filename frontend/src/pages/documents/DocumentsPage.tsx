import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search,
  Upload,
  FolderOpen,
  File,
  FileText,
  FileImage,
  FileSpreadsheet,
  ChevronRight,
  Trash2,
  Download,
  Loader2,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { documentsApi, type DocumentRecord } from '@/lib/documents.api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

const UPLOAD_ROLES = new Set(['admin', 'hr_manager', 'hr_executive']);

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
}

function fileTypeIcon(mime: string): ReactElement {
  if (mime.startsWith('image/'))
    return <FileImage className="size-8 text-blue-500" />;
  if (mime === 'application/pdf')
    return <FileText className="size-8 text-red-500" />;
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv'
  )
    return <FileSpreadsheet className="size-8 text-green-500" />;
  if (mime.startsWith('text/') || mime.includes('document'))
    return <FileText className="size-8 text-indigo-500" />;
  return <File className="size-8 text-muted-foreground" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Build a tree from the flat list of folder paths. */
function buildFolderTree(paths: string[]): FolderNode {
  const root: FolderNode = { name: 'All Files', path: '/', children: [] };
  for (const p of paths) {
    if (!p || p === '/') continue;
    const parts = p.split('/').filter(Boolean);
    let node = root;
    let cur = '';
    for (const part of parts) {
      cur = `${cur}/${part}`.replace(/^\/+/, '/');
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: cur, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  return root;
}

function FolderTree({
  node,
  activePath,
  onSelect,
  depth = 0,
}: {
  node: FolderNode;
  activePath: string;
  onSelect: (p: string) => void;
  depth?: number;
}): ReactElement {
  return (
    <>
      <button
        onClick={() => onSelect(node.path)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md py-1.5 text-sm transition-colors',
          activePath === node.path
            ? 'bg-primary/10 font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted',
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: 8 }}
      >
        <FolderOpen className="size-4 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
      {node.children.map((c) => (
        <FolderTree
          key={c.path}
          node={c}
          activePath={activePath}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

export default function DocumentsPage(): ReactElement {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canUpload = !!user?.role?.slug && UPLOAD_ROLES.has(user.role.slug);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFolder, setActiveFolder] = useState('/');
  const [searchQuery, setSearchQuery] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const { data: filesData, isLoading } = useQuery({
    queryKey: ['documents', activeFolder, searchQuery],
    queryFn: () =>
      documentsApi.list({
        ...(activeFolder && activeFolder !== '/' ? { folder: activeFolder } : {}),
        ...(searchQuery ? { search: searchQuery } : {}),
        limit: 100,
      }),
  });

  const { data: foldersData } = useQuery({
    queryKey: ['documents', 'folders'],
    queryFn: () => documentsApi.folders(),
  });

  const folderTree = useMemo(
    () => buildFolderTree(foldersData?.data ?? []),
    [foldersData],
  );

  const upload = useMutation({
    mutationFn: ({ file, folder }: { file: File; folder: string }) =>
      documentsApi.upload(file, { folder }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success('File uploaded');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(err.response?.data?.error?.message ?? 'Upload failed');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document deleted');
    },
  });

  const onPickFiles = (): void => fileInputRef.current?.click();

  const onFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    for (const file of Array.from(list)) {
      await upload.mutateAsync({ file, folder: activeFolder });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitNewFolder = (): void => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const parent = activeFolder === '/' ? '' : activeFolder;
    const newPath = `${parent}/${trimmed}`.replace(/\/+/g, '/');
    setActiveFolder(newPath);
    setNewFolderOpen(false);
    setNewFolderName('');
    toast.success(`Switched to ${newPath} — upload a file to create it`);
  };

  const files = filesData?.data ?? [];
  const breadcrumbs =
    activeFolder === '/' ? ['All Files'] : ['All Files', ...activeFolder.split('/').filter(Boolean)];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Upload, organise, and share files"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Documents' }]}
        actions={
          canUpload ? (
            <Button onClick={onPickFiles} loading={upload.isPending} size="sm">
              <Upload className="size-4" /> Upload
            </Button>
          ) : null
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFilesSelected}
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="space-y-1 rounded-lg border border-border bg-card p-3 lg:w-56 lg:shrink-0">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Folders
            </span>
            {canUpload && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => setNewFolderOpen(true)}
                title="New folder"
              >
                <Plus className="size-3.5" />
              </Button>
            )}
          </div>
          <FolderTree node={folderTree} activePath={activeFolder} onSelect={setActiveFolder} />
        </aside>

        <div className="flex-1 space-y-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3" />}
                  <span
                    className={
                      i === breadcrumbs.length - 1 ? 'font-medium text-foreground' : ''
                    }
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
            <div className="relative max-w-xs flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
              <FolderOpen className="mb-3 size-12 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No files in this folder</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {canUpload
                  ? 'Upload files to get started — use the button below'
                  : 'Documents shared with you will appear here'}
              </p>
              {canUpload && (
                <Button variant="outline" className="mt-4" onClick={onPickFiles} loading={upload.isPending}>
                  <Upload className="size-4" /> Upload Files
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => (
                <FileCard
                  key={file._id}
                  file={file}
                  onDelete={() => {
                    if (confirm(`Delete "${file.name}"?`)) remove.mutate(file._id);
                  }}
                  removingId={remove.isPending ? remove.variables : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={newFolderOpen} onClose={() => setNewFolderOpen(false)} size="sm">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Create the folder by uploading a file into it. Folder paths persist only when they
            contain at least one file.
          </p>
          <div>
            <Label htmlFor="nf-name">Folder name</Label>
            <Input
              id="nf-name"
              placeholder="HR Documents"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Will be created under {activeFolder === '/' ? 'root' : activeFolder}
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submitNewFolder} disabled={!newFolderName.trim()}>
            Create &amp; switch
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function FileCard({
  file,
  onDelete,
  removingId,
}: {
  file: DocumentRecord;
  onDelete: () => void;
  removingId?: string;
}): ReactElement {
  const isRemoving = removingId === file._id;
  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
      <div className="shrink-0">{fileTypeIcon(file.file.mimeType)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(file.file.size)} · {formatRelative(file.createdAt)}
        </p>
        {typeof file.uploadedBy === 'object' && (
          <p className="text-xs text-muted-foreground">
            by {file.uploadedBy.firstName} {file.uploadedBy.lastName}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <a
          href={file.file.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Download"
          download={file.name}
        >
          <Download className="size-4" />
        </a>
        <button
          onClick={onDelete}
          disabled={isRemoving}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
        >
          {isRemoving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>
    </div>
  );
}
