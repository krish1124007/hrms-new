import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
/**
 * A visit to a site. Lifecycle: `planned` (POST /visits/plan, a schedule, a
 * follow-up) → `in_progress` (check-in) → `completed` (check-out, or the
 * nightly auto-close); `planned → missed` (nightly, the day passed);
 * `planned | in_progress → cancelled`. A check-in without a planned visit
 * creates the visit `in_progress`. See services/field-visits.service.ts.
 *
 * Times: `checkIn.time` / `checkOut.time` are the effective times (the
 * device's `capturedAt` when it was acceptable, else the server's clock);
 * `receivedAt` is when the server got them. `day` is the visit's IST
 * business day (label at UTC midnight): the check-in's, else the planned one.
 */
export type VisitStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'missed';
export declare const VISIT_STATUSES: VisitStatus[];
/** Exceptions shown to managers; computed by the visit engine. */
export interface IVisitFlags {
    awayFromSite: boolean;
    noGps: boolean;
    noSelfie: boolean;
    shortVisit: boolean;
    autoClosed: boolean;
    syncedLate: boolean;
    capturedOffline: boolean;
}
export type VisitReportOutcome = 'completed' | 'follow_up' | 'not_available' | 'other';
export declare const VISIT_REPORT_OUTCOMES: VisitReportOutcome[];
/** The work report (photos/documents hold stored `/uploads/<key>` references). */
export interface IVisitReport {
    notes?: string;
    photos: string[];
    documents: {
        key: string;
        name: string;
    }[];
    peopleMet: {
        name: string;
        designation?: string;
        phone?: string;
    }[];
    outcome?: VisitReportOutcome;
    nextAction?: string;
    /** IST day label of the follow-up. */
    followUpDate?: Date;
    checklist?: {
        checklistId: string;
        answers: {
            itemId: string;
            value: unknown;
        }[];
    };
    /** First submission (server time). */
    submittedAt?: Date;
    updatedAt?: Date;
}
export interface IVisitCheckpoint {
    /** The effective time of the check-in / check-out. */
    time?: Date;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number;
    };
    /** Check-in selfie (`/uploads/<key>`). */
    photo?: string;
    address?: string;
    notes?: string;
    /** Metres from the site's pin at this checkpoint. */
    distanceM?: number;
    /** Device time the action was captured (offline-safe), as sent. */
    capturedAt?: Date;
    /** When the server received it. */
    receivedAt?: Date;
    /** Idempotency key of the action that set this checkpoint. */
    clientRef?: string;
}
export interface IVisit extends Document {
    employeeId: Types.ObjectId;
    siteId: Types.ObjectId;
    /** One of the settings' `visitPurposes` (their spelling). */
    purpose: string;
    status: VisitStatus;
    /** IST business day of the visit (label): the check-in's, else `plannedDate`. */
    day?: Date;
    /** Idempotency key of the check-in that created / started the visit. */
    clientRef?: string;
    /** Business-day label (UTC midnight of the IST day) the visit is planned for. */
    plannedDate?: Date;
    scheduleId?: Types.ObjectId;
    /** User who planned it (planned visits). */
    plannedBy?: Types.ObjectId;
    /** The visit whose report asked for this follow-up. */
    followUpOf?: Types.ObjectId;
    /** Planning notes, or the check-in notes of an unplanned visit. */
    notes?: string;
    checkIn?: IVisitCheckpoint;
    checkOut?: IVisitCheckpoint;
    durationMinutes?: number;
    flags: IVisitFlags;
    report?: IVisitReport;
    /** clientRefs of the report edits already applied (latest 20) — replays are no-ops. */
    reportClientRefs: string[];
    cancelReason?: string;
    cancelledBy?: Types.ObjectId;
    isDeleted?: boolean;
    createdAt: Date;
    updatedAt: Date;
}
/** The IST business day a visit belongs to: its check-in's, else the planned day. */
export declare function visitDayOf(v: {
    checkIn?: {
        time?: Date | null;
    } | null;
    plannedDate?: Date | null;
    createdAt?: Date | null;
}): Date;
export declare const Visit: PaginateModel<IVisit> & Model<IVisit, {}, {}, {}, Document<unknown, {}, IVisit, {}, {}> & IVisit & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=visit.model.d.ts.map