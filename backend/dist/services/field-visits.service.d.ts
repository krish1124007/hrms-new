/**
 * The visit engine's shared pieces: the API shape of a visit (`serializeVisit`),
 * IST day helpers, purpose and work-report validation (upload keys, checklist
 * answers against the settings checklist), the report merge, follow-up
 * visits, notices, recurring schedules, and the nightly field run
 * (`runFieldNightly`: schedules → planned visits 7 days ahead, yesterday's
 * planned → missed, previous days' open visits → auto-closed).
 *
 * No transactions (Mongo standalone): every state change is a conditional
 * write on the status it expects, and replays are recognised by `clientRef`.
 */
import { Types } from 'mongoose';
import { z } from 'zod';
import { type IVisit, type IVisitFlags, type VisitReportOutcome, type VisitStatus } from '../models/visit.model.js';
import { type IScheduleRule, type IVisitSchedule } from '../models/visit-schedule.model.js';
import { type FileOwner } from '../lib/field-files.js';
import { type FieldSettings } from './field-settings.service.js';
/** The owner may edit a report this long after check-out (`field.manage`: any time). */
export declare const REPORT_EDIT_WINDOW_MS: number;
/** Schedules are planned this many days ahead, today included. */
export declare const SCHEDULE_HORIZON_DAYS = 7;
/** A capture this much older than its arrival was made offline (not sent live). */
export declare const CAPTURED_OFFLINE_AFTER_MS: number;
/** The IST business-day label (UTC midnight) of instant `at`. */
export declare const dayLabelOf: (at?: Date) => Date;
/** `YYYY-MM-DD` of a day label. */
export declare const ymdOf: (label: Date) => string;
/** The day label of a `YYYY-MM-DD` string. */
export declare function labelFromYmd(ymd: string): Date;
/** ISO weekday of a day label: 1 = Monday … 7 = Sunday. */
export declare const isoWeekday: (label: Date) => number;
/** `[start, end)` instants of the IST day `label` names. */
export declare function dayWindow(label: Date): {
    start: Date;
    end: Date;
};
/** zod: a `YYYY-MM-DD` calendar date that exists. */
export declare const ymdSchema: z.ZodEffects<z.ZodString, string, string>;
/** zod: a day given as `YYYY-MM-DD` or a timestamp → its IST day label. */
export declare const dayInputSchema: z.ZodEffects<z.ZodString, Date, string>;
/**
 * The settings' spelling of `purpose`, or 400 `INVALID_PURPOSE`. `lenient`
 * (an offline capture: HR may have renamed the purpose since) keeps an
 * unknown purpose as it was sent instead.
 */
export declare function canonicalPurpose(purpose: string, settings: Pick<FieldSettings, 'visitPurposes'>, lenient?: boolean): string;
/** Populate for visit responses (soft-deleted sites and employees still show). */
export declare const VISIT_POPULATE: {
    path: string;
    select: string;
    options: {
        withDeleted: boolean;
    };
}[];
export interface VisitPointJson {
    at: Date;
    location?: {
        lat: number;
        lng: number;
    };
    accuracy?: number;
    selfieUrl?: string;
    distanceM?: number;
    notes?: string;
    address?: string;
    capturedAt?: Date;
    receivedAt?: Date;
}
export interface VisitReportJson {
    notes: string;
    photos: string[];
    documents: Array<{
        url: string;
        name: string;
    }>;
    peopleMet: Array<{
        name: string;
        designation?: string;
        phone?: string;
    }>;
    outcome: VisitReportOutcome | null;
    nextAction?: string;
    followUpDate?: string;
    checklist?: {
        checklistId: string;
        answers: Array<{
            itemId: string;
            value: unknown;
        }>;
    };
    submittedAt: Date | null;
    updatedAt?: Date;
}
export interface VisitJson {
    _id: string;
    clientRef: string | null;
    employeeId: string;
    employee: {
        _id: string;
        firstName: string;
        lastName: string;
        employeeId: string;
    };
    siteId: string;
    site: {
        _id: string;
        name: string;
        type: string;
        location: {
            lat: number;
            lng: number;
        } | null;
        radiusM: number | null;
    };
    purpose: string;
    status: VisitStatus;
    /** The visit's IST business day. */
    day: string | null;
    plannedDate?: string;
    scheduleId?: string;
    plannedBy?: string;
    followUpOf?: string;
    notes?: string;
    checkIn?: VisitPointJson;
    checkOut?: VisitPointJson;
    durationMinutes?: number;
    flags: IVisitFlags;
    report?: VisitReportJson;
    cancelReason?: string;
    createdAt: Date;
    updatedAt: Date;
}
type Obj = Record<string, unknown>;
export declare function emptyFlags(): IVisitFlags;
/**
 * The contract's `Visit` from a stored visit (lean or hydrated; `siteId` and
 * `employeeId` populated with VISIT_POPULATE, or bare ids). Files stay in
 * their stored `/uploads/<key>` form — the response middleware signs them.
 */
export declare function serializeVisit(raw: any): VisitJson;
/** One visit in the API shape (soft-deleted ones too — a replay may name one), or null. */
export declare function loadVisitJson(id: unknown): Promise<VisitJson | null>;
/** The report fields a check-out (`report`) or PATCH /report carries; photos/documents as upload keys. */
export declare const reportFieldsSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    photos: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    documents: z.ZodOptional<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        name?: string | undefined;
    }, {
        key: string;
        name?: string | undefined;
    }>, "many">>;
    peopleMet: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        designation: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        phone?: string | undefined;
        designation?: string | undefined;
    }, {
        name: string;
        phone?: string | undefined;
        designation?: string | undefined;
    }>, "many">>;
    outcome: z.ZodOptional<z.ZodEnum<[VisitReportOutcome, ...VisitReportOutcome[]]>>;
    nextAction: z.ZodOptional<z.ZodString>;
    /** `null` clears it. */
    followUpDate: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, Date, string>>>;
    /** `null` clears it. */
    checklist: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        checklistId: z.ZodString;
        answers: z.ZodDefault<z.ZodArray<z.ZodObject<{
            itemId: z.ZodString;
            value: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodNumber, z.ZodString, z.ZodNull]>>;
        }, "strip", z.ZodTypeAny, {
            itemId: string;
            value?: string | number | boolean | null | undefined;
        }, {
            itemId: string;
            value?: string | number | boolean | null | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        checklistId: string;
        answers: {
            itemId: string;
            value?: string | number | boolean | null | undefined;
        }[];
    }, {
        checklistId: string;
        answers?: {
            itemId: string;
            value?: string | number | boolean | null | undefined;
        }[] | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    outcome?: VisitReportOutcome | undefined;
    documents?: {
        key: string;
        name?: string | undefined;
    }[] | undefined;
    notes?: string | undefined;
    photos?: string[] | undefined;
    peopleMet?: {
        name: string;
        phone?: string | undefined;
        designation?: string | undefined;
    }[] | undefined;
    nextAction?: string | undefined;
    followUpDate?: Date | null | undefined;
    checklist?: {
        checklistId: string;
        answers: {
            itemId: string;
            value?: string | number | boolean | null | undefined;
        }[];
    } | null | undefined;
}, {
    outcome?: VisitReportOutcome | undefined;
    documents?: {
        key: string;
        name?: string | undefined;
    }[] | undefined;
    notes?: string | undefined;
    photos?: string[] | undefined;
    peopleMet?: {
        name: string;
        phone?: string | undefined;
        designation?: string | undefined;
    }[] | undefined;
    nextAction?: string | undefined;
    followUpDate?: string | null | undefined;
    checklist?: {
        checklistId: string;
        answers?: {
            itemId: string;
            value?: string | number | boolean | null | undefined;
        }[] | undefined;
    } | null | undefined;
}>;
export type ReportFieldsInput = z.infer<typeof reportFieldsSchema>;
/** A validated report change: files as stored references; only the fields that were sent. */
export interface ResolvedReport {
    notes?: string;
    photos?: string[];
    documents?: Array<{
        key: string;
        name: string;
    }>;
    peopleMet?: Array<{
        name: string;
        designation?: string;
        phone?: string;
    }>;
    outcome?: VisitReportOutcome;
    nextAction?: string;
    followUpDate?: Date | null;
    checklist?: {
        checklistId: string;
        answers: Array<{
            itemId: string;
            value: unknown;
        }>;
    } | null;
}
type ChecklistAnswer = {
    itemId: string;
    value: unknown;
};
export interface ResolveChecklistOptions {
    /** Whose photo uploads a photo answer may name. */
    owner: FileOwner;
    /** The answers already stored for this same checklist: merged with the sent ones by item. */
    stored?: ChecklistAnswer[];
    /**
     * An offline capture (the checklist may have changed since): an unknown
     * checklist is dropped (null), an answer that no longer fits its item is
     * left out, and missing required answers are tolerated.
     */
    lenient?: boolean;
}
/**
 * Checklist answers checked against the settings checklist: unknown items are
 * dropped (the checklist may have changed since an offline capture), values
 * are typed by the item kind (yes/no → boolean, number → number, select → one
 * of the options, photo → an uploaded photo key). Answers are merged by item
 * into `opts.stored` (an item sent with an empty value clears its answer), and
 * every required item must be answered in the merged set (400
 * `CHECKLIST_INCOMPLETE`, `details.missing`). 400 `INVALID_CHECKLIST` for a
 * checklist that does not exist — null instead when `opts.lenient`.
 */
export declare function resolveChecklist(input: NonNullable<ReportFieldsInput['checklist']>, settings: Pick<FieldSettings, 'checklists'>, opts: ResolveChecklistOptions): Promise<{
    checklistId: string;
    answers: ChecklistAnswer[];
} | null>;
export interface ResolveReportOptions {
    /** The caller's user id: only their own uploads may be attached. */
    userId: unknown;
    /** The visit's stored report: its files are accepted as they are, checklist answers merge into its. */
    existing?: IVisit['report'] | null;
    /** An offline capture: an unknown or changed checklist is degraded instead of refused (see resolveChecklist). */
    lenient?: boolean;
}
/**
 * Validate a report change: upload keys → stored references (the caller's
 * own uploads, or files the report already has), checklist answers checked
 * and merged into the stored ones for the same checklist.
 */
export declare function resolveReport(input: ReportFieldsInput, settings: FieldSettings, opts: ResolveReportOptions): Promise<ResolvedReport>;
/**
 * The Mongo update that merges `report` into a visit's stored report: sent
 * fields replace theirs; photos and documents are ADDED (deduplicated — the
 * apps send only new files on an edit); `submittedAt` is set once.
 */
export declare function reportUpdate(report: ResolvedReport, existing: Pick<NonNullable<IVisit['report']>, 'documents'> | undefined | null, now: Date): {
    $set: Obj;
    $unset: Record<string, ''>;
    $addToSet: Obj;
    $push: Obj;
    $min: Obj;
};
/** Drop empty operators (an empty `$unset` is an error on older servers). */
export declare function compactUpdate(update: Record<string, Obj>): Record<string, Obj>;
/** Remember a report edit's clientRef (latest REPORT_REF_MEMORY). */
export declare const pushReportRef: (clientRef: string) => Obj;
/** Tell the employee's reporting manager a visit report was filed. Never throws. */
export declare function notifyReportSubmitted(visit: Pick<IVisit, '_id' | 'employeeId' | 'siteId' | 'report'>): Promise<void>;
/** Tell an employee someone else planned a visit for them. Never throws. */
export declare function notifyVisitPlanned(visit: Pick<IVisit, '_id' | 'employeeId' | 'siteId' | 'plannedDate'>, plannerUserId: string | null): Promise<void>;
/**
 * A field task was completed: tell the assignee's reporting manager and the
 * task's creator (not the person who completed it). Never throws.
 */
export declare function notifyTaskCompleted(task: {
    _id: unknown;
    title: string;
    assignedTo: unknown;
    createdBy?: unknown;
    completionPhotos?: string[];
}, completedByUserId: string | null): Promise<void>;
/**
 * A report with outcome `follow_up` and a follow-up date plans a visit to the
 * same site for the same employee on that date — once per visit (a later
 * edit of the date moves the still-planned follow-up).
 */
export declare function ensureFollowUpVisit(visit: Pick<IVisit, '_id' | 'employeeId' | 'siteId' | 'purpose' | 'report'>, plannedBy: unknown): Promise<void>;
/** True when `rule` plans a visit on day `label`. */
export declare function scheduleOccursOn(rule: IScheduleRule, label: Date): boolean;
/**
 * Planned visits for `schedule` on each day in `[from, to]` the rule names —
 * exactly once per schedule and date (an occurrence cancelled or deleted is
 * not planned again). Skipped for a deleted site or an employee who is no
 * longer active. Returns how many visits were created.
 */
export declare function planScheduleVisits(schedule: Pick<IVisitSchedule, '_id' | 'employeeId' | 'siteId' | 'purpose' | 'notes' | 'rule' | 'createdBy'>, from: Date, to: Date, checked?: {
    siteLive: boolean;
    employeeActive: boolean;
}): Promise<number>;
/** The planning window that starts on `today`. */
export declare const horizonEnd: (today: Date) => Date;
/**
 * After a schedule changed: from tomorrow on, its planned visits the rule no
 * longer names are removed and the rest take the new site / employee /
 * purpose / notes; then the window is planned again. Today's visit stays as
 * it is (it may be under way).
 */
export declare function replanSchedule(schedule: IVisitSchedule, now?: Date): Promise<void>;
/** A schedule was deleted: its planned visits from tomorrow on go (today's stays). */
export declare function unplanSchedule(scheduleId: unknown, now?: Date): Promise<number>;
/** Planned visits of days before `today` that nobody started become `missed`. */
export declare function markMissedVisits(today: Date): Promise<number>;
/** Where the auto-close ends a visit of `day` checked in at `inAt`: the day's `autoCloseTime`, never before the check-in. */
export declare function autoCloseInstant(day: Date, inAt: Date | null | undefined, settings: Pick<FieldSettings, 'autoCloseTime'>): Date;
/**
 * Visits still in progress from a day before `today` are closed at that day's
 * `autoCloseTime` (never before their check-in) and flagged `autoClosed`,
 * with `checkOut.receivedAt` = `now` (when the auto-close ran). A real
 * check-out captured before then replaces it later (see the check-out).
 * Nightly for everyone; on demand for one employee (`filter.employeeId`)
 * before their check-in, so a visit of an earlier day that synced after the
 * nightly run does not stay open.
 */
export declare function autoCloseOpenVisits(today: Date, settings: FieldSettings, now?: Date, filter?: {
    employeeId?: Types.ObjectId | string;
}): Promise<number>;
export interface FieldNightlyCounts {
    /** Planned visits created from schedules. */
    planned: number;
    /** Planned visits of past days marked missed. */
    missed: number;
    /** Open visits of past days closed automatically. */
    autoClosed: number;
}
/**
 * The nightly field run for the business day `now` falls on (00:15 IST by
 * jobs/field.jobs.ts): previous days' open visits auto-closed, past planned
 * visits marked missed, schedules planned 7 days ahead. Idempotent — a retry
 * or a second run changes nothing more.
 */
export declare function runFieldNightly(now?: Date): Promise<FieldNightlyCounts>;
export {};
//# sourceMappingURL=field-visits.service.d.ts.map