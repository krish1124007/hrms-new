import type { Request, Response } from 'express';
import { z } from 'zod';
import { type VisitStatus } from '../models/visit.model.js';
/** `POST /visits/check-in`: exactly one of `visitId` (a planned visit) / `siteId` / `newSite` (pin + check in). */
export declare const checkInSchema: z.ZodEffects<z.ZodObject<{
    clientRef: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodOptional<z.ZodString>;
    visitId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    siteId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    newSite: z.ZodOptional<z.ZodObject<{
        capturedAt: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        type: z.ZodString;
        location: z.ZodEffects<z.ZodObject<{
            lat: z.ZodNumber;
            lng: z.ZodNumber;
            accuracy: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }>, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }>;
        radiusM: z.ZodOptional<z.ZodNumber>;
        address: z.ZodOptional<z.ZodUnion<[z.ZodObject<{
            line1: z.ZodOptional<z.ZodString>;
            city: z.ZodOptional<z.ZodString>;
            state: z.ZodOptional<z.ZodString>;
            pincode: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        }, {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        }>, z.ZodEffects<z.ZodString, {
            line1: string;
        }, string>]>>;
        contactName: z.ZodOptional<z.ZodString>;
        contactPhone: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
        photo: z.ZodOptional<z.ZodString>;
        assignedTo: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
        location: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        };
        assignedTo?: string[] | undefined;
        address?: {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | {
            line1: string;
        } | undefined;
        photo?: string | undefined;
        notes?: string | undefined;
        radiusM?: number | undefined;
        contactName?: string | undefined;
        contactPhone?: string | undefined;
        capturedAt?: string | undefined;
    }, {
        type: string;
        name: string;
        location: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        };
        assignedTo?: string[] | undefined;
        address?: string | {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | undefined;
        photo?: string | undefined;
        notes?: string | undefined;
        radiusM?: number | undefined;
        contactName?: string | undefined;
        contactPhone?: string | undefined;
        capturedAt?: string | undefined;
    }>>;
    /** Required unless starting a planned visit (which has one). */
    purpose: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        accuracy: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>>;
    /** Upload key from POST /field/uploads/photo. */
    selfieKey: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    siteId?: string | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    purpose?: string | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    newSite?: {
        type: string;
        name: string;
        location: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        };
        assignedTo?: string[] | undefined;
        address?: {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | {
            line1: string;
        } | undefined;
        photo?: string | undefined;
        notes?: string | undefined;
        radiusM?: number | undefined;
        contactName?: string | undefined;
        contactPhone?: string | undefined;
        capturedAt?: string | undefined;
    } | undefined;
    selfieKey?: string | undefined;
}, {
    siteId?: string | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    purpose?: string | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    newSite?: {
        type: string;
        name: string;
        location: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        };
        assignedTo?: string[] | undefined;
        address?: string | {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | undefined;
        photo?: string | undefined;
        notes?: string | undefined;
        radiusM?: number | undefined;
        contactName?: string | undefined;
        contactPhone?: string | undefined;
        capturedAt?: string | undefined;
    } | undefined;
    selfieKey?: string | undefined;
}>, {
    siteId?: string | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    purpose?: string | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    newSite?: {
        type: string;
        name: string;
        location: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        };
        assignedTo?: string[] | undefined;
        address?: {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | {
            line1: string;
        } | undefined;
        photo?: string | undefined;
        notes?: string | undefined;
        radiusM?: number | undefined;
        contactName?: string | undefined;
        contactPhone?: string | undefined;
        capturedAt?: string | undefined;
    } | undefined;
    selfieKey?: string | undefined;
}, {
    siteId?: string | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    purpose?: string | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    newSite?: {
        type: string;
        name: string;
        location: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        };
        assignedTo?: string[] | undefined;
        address?: string | {
            state?: string | undefined;
            line1?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | undefined;
        photo?: string | undefined;
        notes?: string | undefined;
        radiusM?: number | undefined;
        contactName?: string | undefined;
        contactPhone?: string | undefined;
        capturedAt?: string | undefined;
    } | undefined;
    selfieKey?: string | undefined;
}>;
/** `POST /visits/:id/check-out`. */
export declare const checkOutSchema: z.ZodObject<{
    clientRef: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        accuracy: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>>;
    /** The work report (photos/documents as upload keys). */
    report: z.ZodOptional<z.ZodObject<{
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
        outcome: z.ZodOptional<z.ZodEnum<[import("../models/visit.model.js").VisitReportOutcome, ...import("../models/visit.model.js").VisitReportOutcome[]]>>;
        nextAction: z.ZodOptional<z.ZodString>;
        followUpDate: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, Date, string>>>;
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
        outcome?: import("../models/visit.model.js").VisitReportOutcome | undefined;
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
        outcome?: import("../models/visit.model.js").VisitReportOutcome | undefined;
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
    }>>;
    /** Check-out notes (kept apart from the report's). */
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    report?: {
        outcome?: import("../models/visit.model.js").VisitReportOutcome | undefined;
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
    } | undefined;
}, {
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    report?: {
        outcome?: import("../models/visit.model.js").VisitReportOutcome | undefined;
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
    } | undefined;
}>;
/** `PATCH /visits/:id/report` — any report fields; the rest stay as they are. */
export declare const reportPatchSchema: z.ZodObject<{
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
    outcome: z.ZodOptional<z.ZodEnum<[import("../models/visit.model.js").VisitReportOutcome, ...import("../models/visit.model.js").VisitReportOutcome[]]>>;
    nextAction: z.ZodOptional<z.ZodString>;
    followUpDate: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, Date, string>>>;
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
} & {
    clientRef: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    outcome?: import("../models/visit.model.js").VisitReportOutcome | undefined;
    documents?: {
        key: string;
        name?: string | undefined;
    }[] | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
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
    outcome?: import("../models/visit.model.js").VisitReportOutcome | undefined;
    documents?: {
        key: string;
        name?: string | undefined;
    }[] | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
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
/** `POST /visits/plan`. */
export declare const planSchema: z.ZodObject<{
    siteId: z.ZodEffects<z.ZodString, string, string>;
    /** Omitted: the caller. */
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    plannedDate: z.ZodEffects<z.ZodString, string, string>;
    purpose: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    siteId: string;
    plannedDate: string;
    purpose: string;
    employeeId?: string | undefined;
    notes?: string | undefined;
}, {
    siteId: string;
    plannedDate: string;
    purpose: string;
    employeeId?: string | undefined;
    notes?: string | undefined;
}>;
export declare const cancelSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const listQuerySchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    siteId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** One status, or several comma-separated. */
    status: z.ZodOptional<z.ZodPipeline<z.ZodEffects<z.ZodString, string[], string>, z.ZodArray<z.ZodEnum<[VisitStatus, ...VisitStatus[]]>, "many">>>;
    purpose: z.ZodOptional<z.ZodString>;
    /** IST days (`YYYY-MM-DD`), inclusive; the visit's day (check-in, else planned). */
    from: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    sort: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: VisitStatus[] | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    siteId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    purpose?: string | undefined;
}, {
    status?: string | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    siteId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    purpose?: string | undefined;
}>;
export declare const myDayQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
}, {
    date?: string | undefined;
}>;
/** GET /field/visits — scoped (self + direct reports; field.manage: all), newest day first. */
export declare function listVisits(req: Request, res: Response): Promise<void>;
/** GET /field/visits/:id */
export declare function getVisit(req: Request, res: Response): Promise<void>;
/** GET /field/my-day?date= — the caller's day (default today, IST). */
export declare function myDay(req: Request, res: Response): Promise<void>;
/**
 * POST /field/visits/plan — for the caller, or (field.view) one of their
 * direct reports, or (field.manage) anyone. The employee is told when someone
 * else planned it.
 */
export declare function planVisit(req: Request, res: Response): Promise<void>;
/**
 * POST /field/visits/:id/cancel — the employee (planned / in progress), the
 * planner, their direct manager, or a field manager.
 */
export declare function cancelVisit(req: Request, res: Response): Promise<void>;
/** DELETE /field/visits/:id (field.manage) — soft delete. */
export declare function deleteVisit(req: Request, res: Response): Promise<void>;
/**
 * POST /field/visits/check-in — the caller starts a visit: a planned one
 * (`visitId`), at a site (`siteId`), or at a new site pinned in the same step
 * (`newSite`). Flags (never refusals): `awayFromSite` beyond the site radius,
 * `noGps`, `noSelfie` (when the selfie is optional), `syncedLate` /
 * `capturedOffline` for offline captures. A selfie is required unless the
 * settings say otherwise (400 SELFIE_REQUIRED); it must be the caller's own
 * upload and proves one check-in only (409 SELFIE_ALREADY_USED — the visit
 * write marks it used, so a refused check-in leaves it unused). Visits of
 * earlier days still open are auto-closed first; then 409 VISIT_ALREADY_OPEN
 * while another visit that began before `capturedAt` is still open. The first
 * check-in of a day counts as the day's attendance check-in (setting).
 *
 * Captured offline (see `wasCapturedOffline`), what changed since degrades
 * instead of being refused: an unknown purpose is kept as sent, an unknown
 * type of a pinned site becomes "Other", a missing selfie is accepted (with
 * `noSelfie`), a planned visit cancelled meanwhile is started anyway (back to
 * in progress, its `cancelReason` kept), a deleted planned visit becomes an
 * unplanned visit at its site, and a deleted site still takes the visit.
 */
export declare function checkIn(req: Request, res: Response): Promise<void>;
/**
 * POST /field/visits/:id/check-out — the visit's employee closes it, with the
 * work report. `durationMinutes` from check-in to `capturedAt`; `shortVisit`
 * below the settings minimum.
 *
 * A check-out captured on a later day than the visit's day stores that day's
 * auto-close instead (`autoClosed`, at the `autoCloseTime` — never a
 * cross-day duration). For a visit already auto-closed: a check-out captured
 * on its day before the auto-close ran replaces it; any later one leaves it
 * as it is and only adds the work report (and notes) it carries — 200 with
 * the visit either way. A replay (same `clientRef`) answers 200 unchanged.
 * Captured offline, a checklist that changed meanwhile is degraded (see
 * `resolveReport`) instead of refusing the check-out.
 */
export declare function checkOut(req: Request, res: Response): Promise<void>;
/**
 * PATCH /field/visits/:id/report — merge report fields into a checked-out
 * visit (sent fields replace theirs; photos and documents are added;
 * checklist answers merge by item into those stored for the same checklist,
 * the required items checked on the merged set). The employee may edit
 * within 48 h of the check-out (measured to the edit's `capturedAt`, so an
 * edit made offline in time still lands); a field manager any time. The
 * first report filed notifies the reporting manager. A replay (same
 * `clientRef`, also when two copies race) answers 200 and applies nothing.
 */
export declare function updateReport(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-visits.controller.d.ts.map