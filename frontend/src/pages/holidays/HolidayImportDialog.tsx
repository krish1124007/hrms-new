import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { holidaysApi } from '@/lib/systemcore.api';
import { parseHolidayList } from './holiday-import';

const EXAMPLE = '2027-01-26, Republic Day\n2027-03-22, Holi, optional\n15/08/2027, Independence Day';

/**
 * Bulk-add a year's holidays from a pasted list or a CSV file
 * (`POST /holidays/import-calendar`). Ones already on the calendar — same day,
 * same name — are skipped by the server, so re-importing is harmless.
 */
export function HolidayImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseHolidayList(text), [text]);

  const close = (): void => {
    setText('');
    onClose();
  };

  const importMutation = useMutation({
    mutationFn: () => holidaysApi.importCalendar(parsed.rows),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['holidays'] });
      const { created, skipped } = res.data;
      toast.success(`Imported ${created} holiday(s)${skipped ? ` — ${skipped} already on the calendar` : ''}`);
      close();
    },
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setText(await file.text());
  };

  return (
    <Dialog open={open} onClose={close} size="md">
      <DialogHeader>
        <DialogTitle>Import holidays</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <p className="text-sm text-muted-foreground">
          One holiday per line: <code className="rounded bg-muted px-1">date, name, type</code>. The type
          (public, optional or restricted) is optional and defaults to public. Imported holidays apply to every
          department; edit one afterwards to narrow it.
        </p>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label htmlFor="holiday-import-text">Holidays</Label>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
            <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-4" /> Load CSV
            </Button>
          </div>
          <Textarea
            id="holiday-import-text"
            rows={8}
            className="font-mono text-xs"
            placeholder={EXAMPLE}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {text.trim() && (
          <div className="space-y-1 text-xs">
            <p className="text-foreground">{parsed.rows.length} holiday(s) ready to import.</p>
            {parsed.errors.length > 0 && (
              <ul className="max-h-24 list-disc overflow-y-auto pl-4 text-destructive">
                {parsed.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button
          onClick={() => importMutation.mutate()}
          loading={importMutation.isPending}
          disabled={parsed.rows.length === 0 || parsed.errors.length > 0}
        >
          Import
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
