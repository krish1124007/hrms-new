import { useState, type ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Edit3, Trash2, Lock, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { rolesApi, type Role } from '@/lib/phase1.api';

/**
 * Role + permission management.
 *
 * Built-in roles (isSystem=true) can't be modified — the controller enforces
 * this and returns 403 on attempts. The UI reflects that with a lock icon
 * plus a "Duplicate" action so users can copy a system role's permissions
 * into a new editable role.
 */

const titleCase = (s: string): string =>
  s
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

export default function RolesPage(): ReactElement {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Role | 'new' | { clone: Role } | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  const remove = useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => {
      toast.success('Role deleted');
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        description="Define what each role can do in your workspace. System roles are locked — duplicate them to create custom variants."
        icon={Shield}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Roles' }]}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="mr-2 h-4 w-4" />
            New role
          </Button>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </CardContent>
        </Card>
      ) : !roles?.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">No roles defined yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => (
            <Card key={r._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{r.name}</h3>
                      {r.isSystem && (
                        <Badge variant="secondary" className="text-[10px]">
                          <Lock className="mr-1 h-3 w-3" /> System
                        </Badge>
                      )}
                    </div>
                    {r.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing({ clone: r })}
                      title={`Duplicate ${r.name} into a new editable role`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(r)}
                      disabled={r.isSystem}
                      title={r.isSystem ? 'System roles are read-only — use Duplicate to copy' : 'Edit'}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      disabled={r.isSystem || remove.isPending}
                      title={r.isSystem ? 'System roles cannot be deleted' : 'Delete'}
                      onClick={() => {
                        if (confirm(`Delete role "${r.name}"?`)) {
                          remove.mutate(r._id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {r.permissions.slice(0, 8).map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px]">
                      {p}
                    </Badge>
                  ))}
                  {r.permissions.length > 8 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{r.permissions.length - 8} more
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <RoleEditor
          mode={
            editing === 'new'
              ? { kind: 'new' }
              : 'clone' in editing
                ? { kind: 'clone', source: editing.clone }
                : { kind: 'edit', role: editing }
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['roles'] });
          }}
        />
      )}
    </div>
  );
}

/* ─────────── Editor dialog ─────────── */

type EditorMode =
  | { kind: 'new' }
  | { kind: 'edit'; role: Role }
  | { kind: 'clone'; source: Role };

function RoleEditor({
  mode,
  onClose,
  onSaved,
}: {
  mode: EditorMode;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const initial =
    mode.kind === 'edit'
      ? mode.role
      : mode.kind === 'clone'
        ? { ...mode.source, name: `${mode.source.name} (Copy)` }
        : null;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(initial?.permissions ?? []),
  );

  const { data: catalogue, isLoading: catLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: rolesApi.permissions,
    staleTime: 5 * 60_000,
  });

  const isWildcard = permissions.has('*');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        description,
        permissions: [...permissions],
      };
      if (mode.kind === 'edit') return rolesApi.update(mode.role._id, body);
      return rolesApi.create(body);
    },
    onSuccess: () => {
      toast.success(mode.kind === 'edit' ? 'Role updated' : 'Role created');
      onSaved();
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e.response?.data?.error?.message ?? 'Failed to save role');
    },
  });

  const toggle = (p: string): void => {
    setPermissions((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const title =
    mode.kind === 'edit'
      ? `Edit: ${mode.role.name}`
      : mode.kind === 'clone'
        ? `Duplicate from ${mode.source.name}`
        : 'New role';

  return (
    <Dialog open={true} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who should get this role?"
            />
          </div>

          {isWildcard && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              This role has the <code>*</code> wildcard — it grants full access to every
              feature. Remove the wildcard if you want to assign granular permissions instead.
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Permissions ({permissions.size})</Label>
              {catalogue && !isWildcard && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setPermissions((s) => {
                      const all = Object.values(catalogue).flat();
                      const allSelected = all.every((p) => s.has(p));
                      return new Set(allSelected ? [] : all);
                    });
                  }}
                >
                  {Object.values(catalogue)
                    .flat()
                    .every((p) => permissions.has(p))
                    ? 'Clear all'
                    : 'Select all'}
                </button>
              )}
            </div>
            {catLoading ? (
              <div className="flex h-32 items-center justify-center rounded-md border">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : !catalogue ? (
              <p className="text-sm text-muted-foreground">No permissions catalogue available.</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border p-3">
                {Object.entries(catalogue).map(([module, perms]) => {
                  const allSelected = perms.every((p) => permissions.has(p));
                  return (
                    <div key={module}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {titleCase(module)}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            setPermissions((s) => {
                              const next = new Set(s);
                              if (allSelected) perms.forEach((p) => next.delete(p));
                              else perms.forEach((p) => next.add(p));
                              return next;
                            });
                          }}
                        >
                          {allSelected ? 'Clear' : 'All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                        {perms.map((p) => (
                          <label key={p} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={permissions.has(p)}
                              onChange={() => toggle(p)}
                            />
                            <span className="truncate" title={p}>
                              {p.split('.').slice(1).join('.')}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!name || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
