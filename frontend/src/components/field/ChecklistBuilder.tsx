import type { ReactElement } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { ChecklistDraft, ChecklistItemDraft } from '@/lib/field-checklists';
import { CHECKLIST_KIND_LABEL, CHECKLIST_KINDS } from '@/lib/field-visits';

const blankItem = (): ChecklistItemDraft => ({ label: '', kind: 'yes_no', optionsText: '', required: false });

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/**
 * Checklists filled in at check-out, one per visit purpose: each item is a
 * yes/no, text, number, choice (from listed options) or photo question,
 * optionally required.
 */
export function ChecklistBuilder({
  value,
  onChange,
  purposes,
}: {
  value: ChecklistDraft[];
  onChange: (next: ChecklistDraft[]) => void;
  /** The visit purposes a checklist can be attached to. */
  purposes: string[];
}): ReactElement {
  const setList = (n: number, patch: Partial<ChecklistDraft>): void =>
    onChange(value.map((c, i) => (i === n ? { ...c, ...patch } : c)));
  const setItem = (n: number, k: number, patch: Partial<ChecklistItemDraft>): void =>
    setList(n, { items: value[n].items.map((it, j) => (j === k ? { ...it, ...patch } : it)) });

  return (
    <div className="space-y-4">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No checklists yet. A checklist is shown at check-out for visits with its purpose.
        </p>
      )}
      {value.map((c, n) => {
        const purposeOptions = c.purpose && !purposes.includes(c.purpose) ? [c.purpose, ...purposes] : purposes;
        return (
          <fieldset key={c._id ?? `new-${n}`} className="space-y-3 rounded-lg border border-border p-4">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
              <ListChecks className="size-4" aria-hidden />
              Checklist {n + 1}
            </legend>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor={`cl-${n}-name`}>Checklist name</Label>
                <Input
                  id={`cl-${n}-name`}
                  value={c.name}
                  placeholder="e.g. Site inspection"
                  onChange={(e) => setList(n, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cl-${n}-purpose`}>Used for</Label>
                <Select id={`cl-${n}-purpose`} value={c.purpose} onChange={(e) => setList(n, { purpose: e.target.value })}>
                  <option value="">— Visit purpose —</option>
                  {purposeOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 text-destructive"
                  onClick={() => onChange(value.filter((_, i) => i !== n))}
                  aria-label={`Remove checklist ${n + 1}`}
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              </div>
            </div>

            {c.items.length > 0 && (
              <ol className="space-y-2">
                {c.items.map((it, k) => {
                  const label = `Item ${k + 1}`;
                  return (
                    <li
                      key={it._id ?? `new-${k}`}
                      className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1.5rem_2fr_9rem_auto_auto] sm:items-center"
                    >
                      <span className="text-xs font-mono text-muted-foreground">{k + 1}.</span>
                      <Input
                        aria-label={`${label} label`}
                        placeholder="Question or check"
                        value={it.label}
                        onChange={(e) => setItem(n, k, { label: e.target.value })}
                      />
                      <Select
                        aria-label={`${label} type`}
                        value={it.kind}
                        onChange={(e) => setItem(n, k, { kind: e.target.value as ChecklistItemDraft['kind'] })}
                      >
                        {CHECKLIST_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {CHECKLIST_KIND_LABEL[kind]}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          aria-label={`${label} required`}
                          checked={it.required}
                          onChange={(e) => setItem(n, k, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="rounded p-1.5 hover:bg-background disabled:opacity-40"
                          aria-label={`Move ${label.toLowerCase()} up`}
                          disabled={k === 0}
                          onClick={() => setList(n, { items: move(c.items, k, k - 1) })}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1.5 hover:bg-background disabled:opacity-40"
                          aria-label={`Move ${label.toLowerCase()} down`}
                          disabled={k === c.items.length - 1}
                          onClick={() => setList(n, { items: move(c.items, k, k + 1) })}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                          aria-label={`Remove ${label.toLowerCase()}`}
                          onClick={() => setList(n, { items: c.items.filter((_, j) => j !== k) })}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {it.kind === 'select' && (
                        <Input
                          className="sm:col-span-4 sm:col-start-2"
                          aria-label={`${label} options`}
                          placeholder="Choices, separated by commas — e.g. Good, Fair, Poor"
                          value={it.optionsText}
                          onChange={(e) => setItem(n, k, { optionsText: e.target.value })}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setList(n, { items: [...c.items, blankItem()] })}
            >
              <Plus className="size-4" />
              Add item
            </Button>
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...value, { name: '', purpose: '', items: [] }])}
      >
        <Plus className="size-4" />
        Add checklist
      </Button>
    </div>
  );
}
