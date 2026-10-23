import type { Checklist, ChecklistItemKind } from './field.api';

/*
 * The checklist builder edits drafts: a choice item's options are typed as
 * one comma-separated line and split only when the settings are saved.
 */

export interface ChecklistItemDraft {
  _id?: string;
  label: string;
  kind: ChecklistItemKind;
  /** "Good, Fair, Poor" — `select` items only. */
  optionsText: string;
  required: boolean;
}

export interface ChecklistDraft {
  _id?: string;
  name: string;
  purpose: string;
  items: ChecklistItemDraft[];
}

export const splitOptions = (text: string): string[] => [
  ...new Set(
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

export function toChecklistDrafts(checklists: Checklist[]): ChecklistDraft[] {
  return checklists.map((c) => ({
    ...(c._id ? { _id: c._id } : {}),
    name: c.name,
    purpose: c.purpose,
    items: c.items.map((i) => ({
      ...(i._id ? { _id: i._id } : {}),
      label: i.label,
      kind: i.kind,
      optionsText: (i.options ?? []).join(', '),
      required: i.required,
    })),
  }));
}

export function fromChecklistDrafts(drafts: ChecklistDraft[]): Checklist[] {
  return drafts.map((c) => ({
    ...(c._id ? { _id: c._id } : {}),
    name: c.name.trim(),
    purpose: c.purpose,
    items: c.items.map((i) => ({
      ...(i._id ? { _id: i._id } : {}),
      label: i.label.trim(),
      kind: i.kind,
      ...(i.kind === 'select' ? { options: splitOptions(i.optionsText) } : {}),
      required: i.required,
    })),
  }));
}

/** The first problem that stops the checklists being saved, or `null`. */
export function checklistError(drafts: ChecklistDraft[]): string | null {
  for (const [n, c] of drafts.entries()) {
    const which = c.name.trim() ? `“${c.name.trim()}”` : `Checklist ${n + 1}`;
    if (!c.name.trim()) return `${which} needs a name.`;
    if (!c.purpose) return `${which} needs the visit purpose it is used for.`;
    if (c.items.length === 0) return `${which} has no items.`;
    for (const [k, i] of c.items.entries()) {
      if (!i.label.trim()) return `Item ${k + 1} of ${which} needs a label.`;
      if (i.kind === 'select' && splitOptions(i.optionsText).length < 2) {
        return `Item ${k + 1} of ${which} needs at least two choices, separated by commas.`;
      }
    }
  }
  return null;
}
