import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { AlertTriangle, Car, ListChecks, Plus, RotateCw, Settings2, SlidersHorizontal, Tags, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ChecklistBuilder } from '@/components/field/ChecklistBuilder';
import { useFieldSettings, useUpdateFieldSettings } from '@/hooks/use-field';
import { apiErrorMessage } from '@/lib/api-error';
import type { FieldSettings, VehicleType } from '@/lib/field.api';
import {
  checklistError,
  fromChecklistDrafts,
  toChecklistDrafts,
  type ChecklistDraft,
} from '@/lib/field-checklists';

interface VehicleDraft {
  type: VehicleType;
  label: string;
  rate: string;
}

interface Draft {
  selfieRequired: boolean;
  visitCountsAsAttendance: boolean;
  defaultSiteRadiusM: string;
  shortVisitMinutes: string;
  offlineMaxAgeDays: string;
  autoCloseTime: string;
  siteTypes: string[];
  visitPurposes: string[];
  vehicles: VehicleDraft[];
  checklists: ChecklistDraft[];
}

const VEHICLE_TYPES: Array<{ value: VehicleType; label: string }> = [
  { value: 'bike', label: 'Two-wheeler' },
  { value: 'car', label: 'Car' },
  { value: 'other', label: 'Other' },
];

function toDraft(s: FieldSettings): Draft {
  return {
    selfieRequired: s.selfieRequired,
    visitCountsAsAttendance: s.visitCountsAsAttendance,
    defaultSiteRadiusM: String(s.defaultSiteRadiusM),
    shortVisitMinutes: String(s.shortVisitMinutes),
    offlineMaxAgeDays: String(s.offlineMaxAgeDays),
    autoCloseTime: s.autoCloseTime,
    siteTypes: [...s.siteTypes],
    visitPurposes: [...s.visitPurposes],
    vehicles: s.vehicles.map((v) => ({ type: v.type, label: v.label, rate: String(v.ratePerKm) })),
    checklists: toChecklistDrafts(s.checklists),
  };
}

function fromDraft(d: Draft): FieldSettings {
  return {
    selfieRequired: d.selfieRequired,
    visitCountsAsAttendance: d.visitCountsAsAttendance,
    defaultSiteRadiusM: Number(d.defaultSiteRadiusM),
    shortVisitMinutes: Number(d.shortVisitMinutes),
    offlineMaxAgeDays: Number(d.offlineMaxAgeDays),
    autoCloseTime: d.autoCloseTime,
    siteTypes: d.siteTypes,
    visitPurposes: d.visitPurposes,
    vehicles: d.vehicles.map((v) => ({ type: v.type, label: v.label.trim(), ratePerKm: Number(v.rate) })),
    checklists: fromChecklistDrafts(d.checklists),
  };
}

const isInt = (s: string, min: number, max: number): boolean => /^\d+$/.test(s.trim()) && +s >= min && +s <= max;

/** The first problem that stops the settings being saved, or `null`. */
function draftError(d: Draft): string | null {
  if (!isInt(d.defaultSiteRadiusM, 10, 5000)) return 'The default site radius must be a whole number of metres from 10 to 5000.';
  if (!isInt(d.shortVisitMinutes, 0, 240)) return 'The short-visit limit must be 0–240 minutes.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.autoCloseTime)) return 'Choose the time open visits are closed.';
  if (!isInt(d.offlineMaxAgeDays, 1, 30)) return 'Offline records may be 1–30 days old.';
  if (d.siteTypes.length === 0) return 'Keep at least one site type.';
  if (d.visitPurposes.length === 0) return 'Keep at least one visit purpose.';
  if (d.vehicles.length === 0) return 'Keep at least one vehicle for travel allowance.';
  for (const [i, v] of d.vehicles.entries()) {
    if (!v.label.trim()) return `Vehicle ${i + 1} needs a name.`;
    const rate = Number(v.rate);
    if (v.rate.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 1000) {
      return `The rate for ${v.label.trim() || `vehicle ${i + 1}`} must be between ₹0 and ₹1000 per km.`;
    }
  }
  const unknown = d.checklists.find((c) => c.purpose && !d.visitPurposes.includes(c.purpose));
  if (unknown) return `“${unknown.name || 'A checklist'}” is used for “${unknown.purpose}”, which is no longer a visit purpose.`;
  return checklistError(d.checklists);
}

/* ── Small editors ── */

function StringListEditor({
  id,
  label,
  values,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}): ReactElement {
  const [text, setText] = useState('');
  const add = (): void => {
    const v = text.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText('');
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <ul className="flex flex-wrap gap-1.5" aria-label={label}>
        {values.map((v) => (
          <li key={v} className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 hover:bg-background"
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="max-w-xs"
        />
        <Button type="button" variant="outline" onClick={add} disabled={!text.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}): ReactElement {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  suffix: string;
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" min={min} max={max} className="w-28" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Settings2; title: string; description: string; children: ReactNode }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Company-wide field visit rules, lists, travel allowance rates and checklists (`field.manage`). */
export default function FieldSettingsPage(): ReactElement {
  const q = useFieldSettings();
  const save = useUpdateFieldSettings();
  const loaded = q.data?.data;
  const [draft, setDraft] = useState<Draft | null>(null);

  // Start from the server's settings, and again after each save.
  useEffect(() => {
    if (loaded) setDraft(toDraft(loaded));
  }, [loaded]);

  const header = (
    <PageHeader
      title="Field settings"
      description="Rules for check-ins, the lists employees pick from, travel allowance rates and visit checklists"
      icon={Settings2}
      breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Settings' }]}
    />
  );

  if (q.isLoading || (!draft && !q.error)) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the field settings"
          description={apiErrorMessage(q.error)}
          action={
            <Button variant="outline" onClick={() => void q.refetch()}>
              <RotateCw className="size-4" /> Retry
            </Button>
          }
        />
      </div>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const error = draftError(draft);
  const dirty = !!loaded && JSON.stringify(fromDraft(draft)) !== JSON.stringify(fromDraft(toDraft(loaded)));

  return (
    <div className="space-y-6 pb-20">
      {header}

      <Section icon={SlidersHorizontal} title="Check-in and check-out" description="How visits are checked and when they are flagged.">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <Toggle
              id="fs-selfie"
              checked={draft.selfieRequired}
              onChange={(v) => set('selfieRequired', v)}
              label="Selfie required at check-in"
              hint="Off: a selfie is optional and a check-in without one is flagged “No selfie”."
            />
            <Toggle
              id="fs-attendance"
              checked={draft.visitCountsAsAttendance}
              onChange={(v) => set('visitCountsAsAttendance', v)}
              label="First visit counts as attendance"
              hint="A site check-in marks the day's attendance when the employee has not checked in yet."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="fs-radius"
              label="Default site radius"
              hint="For new sites; check-ins farther away are flagged."
              value={draft.defaultSiteRadiusM}
              onChange={(v) => set('defaultSiteRadiusM', v)}
              min={10}
              max={5000}
              suffix="m"
            />
            <NumberField
              id="fs-short"
              label="Short visit below"
              hint="Visits shorter than this are flagged."
              value={draft.shortVisitMinutes}
              onChange={(v) => set('shortVisitMinutes', v)}
              min={0}
              max={240}
              suffix="min"
            />
            <div className="space-y-1.5">
              <Label htmlFor="fs-autoclose">Close open visits at</Label>
              <Input
                id="fs-autoclose"
                type="time"
                className="w-32"
                value={draft.autoCloseTime}
                onChange={(e) => set('autoCloseTime', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">IST; visits not checked out are closed and flagged.</p>
            </div>
            <NumberField
              id="fs-offline"
              label="Offline records up to"
              hint="Older visits recorded without network are refused when they sync."
              value={draft.offlineMaxAgeDays}
              onChange={(v) => set('offlineMaxAgeDays', v)}
              min={1}
              max={30}
              suffix="days old"
            />
          </div>
        </div>
      </Section>

      <Section icon={Tags} title="Lists" description="What employees choose from when they pin a site or check in.">
        <div className="grid gap-6 md:grid-cols-2">
          <StringListEditor
            id="fs-site-types"
            label="Site types"
            values={draft.siteTypes}
            onChange={(v) => set('siteTypes', v)}
            placeholder="Add a site type"
          />
          <StringListEditor
            id="fs-purposes"
            label="Visit purposes"
            values={draft.visitPurposes}
            onChange={(v) => set('visitPurposes', v)}
            placeholder="Add a visit purpose"
          />
        </div>
      </Section>

      <Section
        icon={Car}
        title="Travel allowance"
        description="Rate per km for each vehicle; a day's claim is its kilometres × the rate of the vehicle used."
      >
        <div className="space-y-2">
          {draft.vehicles.map((v, i) => (
            <div key={i} className="grid items-center gap-2 sm:grid-cols-[10rem_1fr_10rem_auto]">
              <Select
                aria-label={`Vehicle ${i + 1} kind`}
                value={v.type}
                onChange={(e) =>
                  set('vehicles', draft.vehicles.map((x, j) => (j === i ? { ...x, type: e.target.value as VehicleType } : x)))
                }
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={`Vehicle ${i + 1} name`}
                placeholder="Name shown to employees"
                value={v.label}
                onChange={(e) => set('vehicles', draft.vehicles.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">₹</span>
                <Input
                  aria-label={`Vehicle ${i + 1} rate per km`}
                  type="number"
                  min={0}
                  step="0.5"
                  value={v.rate}
                  onChange={(e) => set('vehicles', draft.vehicles.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))}
                />
                <span className="whitespace-nowrap text-sm text-muted-foreground">/ km</span>
              </div>
              <button
                type="button"
                className="rounded p-2 text-destructive hover:bg-destructive/10"
                aria-label={`Remove vehicle ${i + 1}`}
                onClick={() => set('vehicles', draft.vehicles.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => set('vehicles', [...draft.vehicles, { type: 'other', label: '', rate: '0' }])}
          >
            <Plus className="size-4" />
            Add vehicle
          </Button>
        </div>
      </Section>

      <Section
        icon={ListChecks}
        title="Visit checklists"
        description="Questions answered at check-out for visits with a given purpose — e.g. an inspection checklist."
      >
        <ChecklistBuilder value={draft.checklists} onChange={(v) => set('checklists', v)} purposes={draft.visitPurposes} />
      </Section>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        {error ? (
          <p className="mr-auto text-sm text-destructive">{error}</p>
        ) : (
          <p className="mr-auto text-sm text-muted-foreground">{dirty ? 'Unsaved changes' : 'All changes saved'}</p>
        )}
        <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => loaded && setDraft(toDraft(loaded))}>
          Discard changes
        </Button>
        <Button disabled={!!error || !dirty} loading={save.isPending} onClick={() => save.mutate(fromDraft(draft))}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
