import {
  refId,
  type ChecklistAnswerValue,
  type ChecklistItemKind,
  type FieldTask,
  type Site,
  type VisitFlags,
  type VisitOutcome,
  type VisitStatus,
} from './field.api';

/** Display text for visit statuses, flags, outcomes and checklist answers. */

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Missed',
};

export const VISIT_STATUSES = Object.keys(VISIT_STATUS_LABEL) as VisitStatus[];

/** Flags as they are listed on screen, with what each one means. */
export const VISIT_FLAGS: ReadonlyArray<{ key: keyof VisitFlags; label: string; hint: string; serious: boolean }> = [
  { key: 'awayFromSite', label: 'Away from site', hint: "Checked in outside the site's radius", serious: true },
  { key: 'noGps', label: 'No GPS', hint: 'Checked in without a location fix', serious: true },
  { key: 'noSelfie', label: 'No selfie', hint: 'Checked in without a selfie', serious: true },
  { key: 'shortVisit', label: 'Short visit', hint: 'Shorter than the minimum visit length', serious: false },
  { key: 'autoClosed', label: 'Auto-closed', hint: 'Not checked out; closed automatically at day end', serious: false },
  { key: 'syncedLate', label: 'Synced late', hint: 'Reached the server more than 15 minutes after it happened', serious: false },
  { key: 'capturedOffline', label: 'Captured offline', hint: 'Recorded without a network connection', serious: false },
];

export function activeFlags(flags: Partial<VisitFlags> | undefined): typeof VISIT_FLAGS {
  return VISIT_FLAGS.filter((f) => flags?.[f.key]);
}

export const OUTCOME_LABEL: Record<VisitOutcome, string> = {
  completed: 'Work completed',
  follow_up: 'Follow-up needed',
  not_available: 'Person not available',
  other: 'Other',
};

export const CHECKLIST_KIND_LABEL: Record<ChecklistItemKind, string> = {
  yes_no: 'Yes / No',
  text: 'Text',
  number: 'Number',
  select: 'Choice',
  photo: 'Photo',
};

export const CHECKLIST_KINDS = Object.keys(CHECKLIST_KIND_LABEL) as ChecklistItemKind[];

/** "450 m" / "1.2 km". */
export function formatDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/** "45 min" / "2 h 5 min". */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** A typed pin as numbers, or `null` while either box is empty or not a coordinate. */
export function parseLatLng(lat: string, lng: string): { lat: number; lng: number } | null {
  if (lat.trim() === '' || lng.trim() === '') return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || la < -90 || la > 90) return null;
  if (!Number.isFinite(ln) || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

/** A checklist answer as text (a photo answer is shown as an image instead). */
export function answerText(kind: ChecklistItemKind | undefined, value: ChecklistAnswerValue | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'yes_no' || typeof value === 'boolean') {
    if (value === true || value === 'yes' || value === 'true') return 'Yes';
    if (value === false || value === 'no' || value === 'false') return 'No';
  }
  return String(value);
}

const SITE_EDIT_WINDOW_MS = 24 * 3600_000;

/**
 * `field.manage` edits any site; whoever added one may edit it for 24 hours.
 * `createdBy` is the creator's login, so it is compared with the signed-in
 * user's id (`myUserId`), never an employee id.
 */
export function canEditSite(
  site: Pick<Site, 'createdBy' | 'createdAt'>,
  ctx: { canManage: boolean; myUserId?: string },
): boolean {
  if (ctx.canManage) return true;
  if (!ctx.myUserId || site.createdBy?._id !== ctx.myUserId) return false;
  return !site.createdAt || Date.now() - new Date(site.createdAt).getTime() < SITE_EDIT_WINDOW_MS;
}

/**
 * May the signed-in user edit, cancel or delete `task` (the server's
 * `managesTask`)? `field.manage`; whoever created it (`createdBy` is a user
 * id); or the assignee's manager. A `field.view` holder's task list holds only
 * their own and their direct reports' tasks, so one not assigned to them is a
 * report's.
 */
export function canManageTask(
  task: Pick<FieldTask, 'assignedTo' | 'createdBy'>,
  ctx: { canManage: boolean; myUserId?: string; myEmployeeId?: string },
): boolean {
  if (ctx.canManage) return true;
  if (ctx.myUserId && task.createdBy && task.createdBy === ctx.myUserId) return true;
  const assignee = refId(task.assignedTo);
  return !!ctx.myEmployeeId && assignee !== '' && assignee !== ctx.myEmployeeId;
}
