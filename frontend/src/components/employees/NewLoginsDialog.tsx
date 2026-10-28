import { useState, type ReactElement } from 'react';
import { Check, Copy, Download, KeyRound, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CreateLoginsResult } from '@/lib/systemcore.api';
import { todayKey } from '@/lib/business-day';

const csvCell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** One line per new login, the way HR hands them out. */
function loginsCsv(result: CreateLoginsResult, signInUrl: string): string {
  const rows = [['Employee ID', 'Name', 'Login e-mail', 'Starting password', 'Role', 'Sign in at']];
  for (const l of result.created) {
    rows.push([l.employee.employeeId, l.employee.name, l.email, l.password ?? '(existing password)', l.role, signInUrl]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function loginsText(result: CreateLoginsResult, signInUrl: string): string {
  return result.created
    .map(
      (l) =>
        `${l.employee.name} (${l.employee.employeeId})\nSign in at ${signInUrl} or in the mobile app\nE-mail: ${l.email}\nPassword: ${l.password ?? '(their existing password)'}`,
    )
    .join('\n\n');
}

/**
 * The logins just created, with their starting passwords — shown this once:
 * the server keeps only a hash. HR copies or downloads them and hands each
 * one to its employee, who can change it later under My Profile.
 */
export function NewLoginsDialog({
  result,
  onClose,
}: {
  result: CreateLoginsResult | null;
  onClose: () => void;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const signInUrl = window.location.origin;
  const created = result?.created ?? [];
  const skipped = result?.skipped ?? [];
  const withPassword = created.filter((l) => l.password).length;

  const copy = async (): Promise<void> => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(loginsText(result, signInUrl));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — download the list instead');
    }
  };

  const download = (): void => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([loginsCsv(result, signInUrl)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `new-logins-${todayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!result} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          {created.length === 1 ? `Login created for ${created[0]!.employee.name}` : `${created.length} logins created`}
        </DialogTitle>
        <DialogDescription>
          They can sign in now at {signInUrl} or in the mobile app with their e-mail and this starting password. They
          can change it later under My Profile.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="max-h-[60vh] space-y-4 overflow-y-auto">
        {withPassword > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {withPassword === 1 ? 'This password is' : 'These passwords are'} shown only now. Copy or download{' '}
              {withPassword === 1 ? 'it' : 'them'} before you close this window. If one is lost, use Reset password on
              the employee's login.
            </span>
          </p>
        )}

        {created.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Login e-mail</th>
                  <th className="px-3 py-2 font-medium">Starting password</th>
                </tr>
              </thead>
              <tbody>
                {created.map((l) => (
                  <tr key={l.employee._id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium">{l.employee.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.employee.employeeId} · {l.role}
                      </p>
                    </td>
                    <td className="break-all px-3 py-2">{l.email}</td>
                    <td className="px-3 py-2">
                      {l.password ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{l.password}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Linked to their existing login — password unchanged
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {skipped.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Not created ({skipped.length})</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {skipped.map((s) => (
                <li key={s.employee._id}>
                  <span className="text-foreground">{s.employee.name}</span> — {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        {created.length > 0 && (
          <>
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="outline" onClick={download}>
              <Download className="size-4" /> Download list
            </Button>
          </>
        )}
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </Dialog>
  );
}
