import { useEffect, useState, type ReactElement } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useCanPickEmployees,
  useCreateSite,
  useFieldReps,
  useFieldSettings,
  useUpdateSite,
} from '@/hooks/use-field';
import { newClientRef, type FieldEmployeeRef, type Site, type SiteInput, type SiteUpdate } from '@/lib/field.api';
import { parseLatLng } from '@/lib/field-visits';
import { PhotoInput } from './FieldBits';
import { SitePinPicker } from './SitePinPicker';

interface FormState {
  name: string;
  type: string;
  lat: string;
  lng: string;
  radius: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  photo: string;
  assigned: FieldEmployeeRef[];
}

/** A new site starts without a type: the person adding it picks one. */
function initialState(site: Site | null | undefined, defaultRadius: number): FormState {
  return {
    name: site?.name ?? '',
    type: site?.type ?? '',
    lat: site ? site.location.lat.toFixed(6) : '',
    lng: site ? site.location.lng.toFixed(6) : '',
    radius: String(site?.radiusM ?? defaultRadius),
    line1: site?.address?.line1 ?? '',
    city: site?.address?.city ?? '',
    state: site?.address?.state ?? '',
    pincode: site?.address?.pincode ?? '',
    contactName: site?.contactName ?? '',
    contactPhone: site?.contactPhone ?? '',
    notes: site?.notes ?? '',
    photo: '',
    assigned: site?.assignedTo ?? [],
  };
}

const MAX_RADIUS_M = 5000;

/**
 * Add or edit a site. The pin (map click, drag, typed coordinates or the
 * browser's location) and the radius decide which check-ins are flagged as
 * away from the site. A new site is sent with a `clientRef` made when the
 * dialog opens, so a retried save cannot create it twice.
 */
export function SiteFormDialog({
  open,
  onClose,
  site,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Editing this site; `null`/absent creates one. */
  site?: Site | null;
  onSaved?: (site: Site) => void;
}): ReactElement {
  const { settings } = useFieldSettings();
  const canPick = useCanPickEmployees();
  const { data: people = [] } = useFieldReps(open && canPick);
  const create = useCreateSite();
  const update = useUpdateSite();

  const [form, setForm] = useState<FormState>(() => initialState(site, settings.defaultSiteRadiusM));
  const [clientRef, setClientRef] = useState(newClientRef);
  const [radiusTouched, setRadiusTouched] = useState(false);

  // A fresh form (and idempotency reference) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(initialState(site, settings.defaultSiteRadiusM));
    setClientRef(newClientRef());
    setRadiusTouched(false);
    // Only on open: the settings arriving later must not wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, site?._id]);

  // A new site takes the company's default radius once the settings load, unless it was typed.
  useEffect(() => {
    if (open && !site && !radiusTouched) {
      setForm((f) => ({ ...f, radius: String(settings.defaultSiteRadiusM) }));
    }
  }, [open, site, radiusTouched, settings.defaultSiteRadiusM]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }));

  const pin = parseLatLng(form.lat, form.lng);
  const radius = Number(form.radius);
  const radiusOk = Number.isFinite(radius) && radius >= 10 && radius <= MAX_RADIUS_M;
  const valid = form.name.trim() !== '' && form.type !== '' && pin !== null && radiusOk;
  const addressQuery = [form.line1, form.city, form.state, form.pincode].filter((s) => s.trim()).join(', ');
  const typeOptions = form.type && !settings.siteTypes.includes(form.type) ? [form.type, ...settings.siteTypes] : settings.siteTypes;

  const submit = (): void => {
    if (!valid || !pin) return;
    const address = {
      line1: form.line1.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
    };
    const done = (res: { data: Site }): void => {
      onSaved?.(res.data);
      onClose();
    };
    if (site) {
      // An emptied text field goes as '' so the server clears it.
      const input: SiteUpdate = {
        name: form.name.trim(),
        type: form.type,
        location: pin,
        radiusM: radius,
        address,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        notes: form.notes.trim(),
        ...(form.photo ? { photo: form.photo } : {}),
        ...(canPick ? { assignedTo: form.assigned.map((p) => p._id) } : {}),
      };
      update.mutate({ id: site._id, input }, { onSuccess: done });
      return;
    }
    const hasAddress = Object.values(address).some(Boolean);
    const input: SiteInput = {
      clientRef,
      name: form.name.trim(),
      type: form.type,
      location: pin,
      radiusM: radius,
      ...(hasAddress ? { address } : {}),
      ...(form.contactName.trim() ? { contactName: form.contactName.trim() } : {}),
      ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      ...(form.photo ? { photo: form.photo } : {}),
      ...(form.assigned.length > 0 ? { assignedTo: form.assigned.map((p) => p._id) } : {}),
    };
    create.mutate(input, { onSuccess: done });
  };

  const unassigned = people.filter((p) => !form.assigned.some((a) => a._id === p._id));

  return (
    <Dialog open={open} onClose={onClose} size="xl">
      <DialogHeader>
        <DialogTitle>{site ? `Edit ${site.name}` : 'New site'}</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[75vh] space-y-4 overflow-y-auto">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="site-name">Name *</Label>
            <Input id="site-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-type">Type *</Label>
            <Select id="site-type" value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="">— Select —</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-radius">Radius (m) *</Label>
            <Input
              id="site-radius"
              type="number"
              min={10}
              max={MAX_RADIUS_M}
              step={10}
              value={form.radius}
              aria-invalid={!radiusOk || undefined}
              onChange={(e) => {
                setRadiusTouched(true);
                set('radius', e.target.value);
              }}
            />
          </div>
        </div>
        {!radiusOk && form.radius !== '' && (
          <p className="text-xs text-destructive">The radius must be between 10 and {MAX_RADIUS_M} m.</p>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Location *</legend>
          <SitePinPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
            radiusM={radiusOk ? radius : settings.defaultSiteRadiusM}
            addressQuery={addressQuery}
          />
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="site-line1">Address</Label>
          <Input
            id="site-line1"
            placeholder="Street address"
            value={form.line1}
            onChange={(e) => set('line1', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input aria-label="City" placeholder="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <Input aria-label="State" placeholder="State" value={form.state} onChange={(e) => set('state', e.target.value)} />
          <Input
            aria-label="Pincode"
            placeholder="Pincode"
            value={form.pincode}
            onChange={(e) => set('pincode', e.target.value)}
          />
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Left empty, the address is filled in from the pin when map lookups are configured.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="site-contact">Contact person</Label>
            <Input id="site-contact" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-phone">Contact phone</Label>
            <Input
              id="site-phone"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="site-notes">Notes</Label>
          <Textarea id="site-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>

        {canPick && (
          <div className="space-y-1.5">
            <Label htmlFor="site-assign">Assigned to</Label>
            {form.assigned.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Assigned employees">
                {form.assigned.map((p) => (
                  <li
                    key={p._id}
                    className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs"
                  >
                    {p.firstName} {p.lastName}
                    <button
                      type="button"
                      aria-label={`Remove ${p.firstName} ${p.lastName}`}
                      className="rounded-full p-0.5 hover:bg-background"
                      onClick={() => set('assigned', form.assigned.filter((a) => a._id !== p._id))}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Select
              id="site-assign"
              value=""
              onChange={(e) => {
                const p = people.find((x) => x._id === e.target.value);
                if (p) set('assigned', [...form.assigned, p]);
              }}
            >
              <option value="">Add an employee…</option>
              {unassigned.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.firstName} {p.lastName}
                  {p.employeeId ? ` (${p.employeeId})` : ''}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Assigned employees see the site in their lists. Whoever adds a site is assigned to it.
            </p>
          </div>
        )}

        <PhotoInput value={form.photo} onChange={(key) => set('photo', key)} label={site?.photoUrl ? 'Replace photo' : 'Photo'} />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!valid}>
          {site ? 'Save' : 'Add site'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
