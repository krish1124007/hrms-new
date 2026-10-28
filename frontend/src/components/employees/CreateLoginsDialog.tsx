import { useEffect, useState, type ReactElement } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateLogins, useEmployeesWithoutLogin } from '@/hooks/use-access';
import type { CreateLoginsResult } from '@/lib/systemcore.api';
import { NewLoginsDialog } from './NewLoginsDialog';

/**
 * "Create logins" on the Employees list: every employed person without a
 * login, all ticked, and one click gives each of them a login with a random
 * starting password — listed afterwards to copy or download and hand out.
 */
export function CreateLoginsDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const list = useEmployeesWithoutLogin(open);
  const create = useCreateLogins();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CreateLoginsResult | null>(null);
  const people = list.data ?? [];

  // Everyone starts ticked each time the list (re)loads.
  useEffect(() => {
    if (open && list.data) setSelected(new Set(list.data.map((e) => e._id)));
  }, [open, list.data]);

  const toggle = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allTicked = people.length > 0 && selected.size === people.length;

  const submit = (): void => {
    create.mutate([...selected], {
      onSuccess: (data) => {
        setResult(data);
        onClose();
      },
    });
  };

  return (
    <>
      <Dialog open={open} onClose={() => !create.isPending && onClose()} size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" /> Create logins
          </DialogTitle>
          <DialogDescription>
            These employees have no login, so they cannot sign in to the web or mobile app. Each one ticked gets a
            login with their e-mail and a random starting password, shown to you once to hand out. Field staff get the
            Field Employee role, everyone else Employee.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[55vh] space-y-2 overflow-y-auto">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.isSuccess && people.length === 0 && (
            <p className="text-sm text-muted-foreground">Every employee already has a login.</p>
          )}
          {people.length > 0 && (
            <>
              <label className="flex items-center gap-2 border-b border-border pb-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={allTicked}
                  onChange={() => setSelected(allTicked ? new Set() : new Set(people.map((e) => e._id)))}
                />
                All {people.length} employees
              </label>
              <ul className="space-y-1">
                {people.map((e) => (
                  <li key={e._id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/40">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4"
                        checked={selected.has(e._id)}
                        onChange={() => toggle(e._id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">
                          {e.firstName} {e.lastName}
                        </span>{' '}
                        <span className="text-muted-foreground">· {e.employeeId}</span>
                        <span className="block break-all text-xs text-muted-foreground">
                          {e.email}
                          {e.department?.name ? ` · ${e.department.name}` : ''}
                          {e.isFieldStaff ? ' · Field staff' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={selected.size === 0} loading={create.isPending}>
            Create {selected.size} {selected.size === 1 ? 'login' : 'logins'}
          </Button>
        </DialogFooter>
      </Dialog>
      <NewLoginsDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}
