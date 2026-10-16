import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const updateConfigSchema: z.ZodObject<{
    enabledMethods: z.ZodArray<z.ZodEnum<["face", "qr", "dynamic_qr", "ip", "site", "geofence", "device", "manual"]>, "many">;
    settings: z.ZodOptional<z.ZodObject<{
        autoCheckoutTime: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        overtimeThresholdMinutes: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        lateMarkAfterMinutes: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        halfDayThresholdHours: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        requirePhotoOnCheckIn: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        requireLocation: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        requireNoteOnLateCheckIn: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        freeLateDaysPerMonth: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        requireLocation?: boolean | undefined;
        autoCheckoutTime?: string | undefined;
        overtimeThresholdMinutes?: number | undefined;
        lateMarkAfterMinutes?: number | undefined;
        halfDayThresholdHours?: number | undefined;
        requirePhotoOnCheckIn?: boolean | undefined;
        requireNoteOnLateCheckIn?: boolean | undefined;
        freeLateDaysPerMonth?: number | undefined;
    }, {
        requireLocation?: boolean | undefined;
        autoCheckoutTime?: string | undefined;
        overtimeThresholdMinutes?: number | undefined;
        lateMarkAfterMinutes?: number | undefined;
        halfDayThresholdHours?: number | undefined;
        requirePhotoOnCheckIn?: boolean | undefined;
        requireNoteOnLateCheckIn?: boolean | undefined;
        freeLateDaysPerMonth?: number | undefined;
    }>>;
    liveTracking: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        intervalSeconds: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean | undefined;
        intervalSeconds?: number | undefined;
    }, {
        enabled?: boolean | undefined;
        intervalSeconds?: number | undefined;
    }>>;
    weekOff: z.ZodOptional<z.ZodObject<{
        fullDaysOff: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>>;
        partialDaysOff: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
            day: z.ZodNumber;
            weeks: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        }, "strip", z.ZodTypeAny, {
            day: number;
            weeks: number[];
        }, {
            day: number;
            weeks?: number[] | undefined;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        fullDaysOff?: number[] | undefined;
        partialDaysOff?: {
            day: number;
            weeks: number[];
        }[] | undefined;
    }, {
        fullDaysOff?: number[] | undefined;
        partialDaysOff?: {
            day: number;
            weeks?: number[] | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    enabledMethods: ("manual" | "geofence" | "qr" | "face" | "ip" | "device" | "dynamic_qr" | "site")[];
    settings?: {
        requireLocation?: boolean | undefined;
        autoCheckoutTime?: string | undefined;
        overtimeThresholdMinutes?: number | undefined;
        lateMarkAfterMinutes?: number | undefined;
        halfDayThresholdHours?: number | undefined;
        requirePhotoOnCheckIn?: boolean | undefined;
        requireNoteOnLateCheckIn?: boolean | undefined;
        freeLateDaysPerMonth?: number | undefined;
    } | undefined;
    liveTracking?: {
        enabled?: boolean | undefined;
        intervalSeconds?: number | undefined;
    } | undefined;
    weekOff?: {
        fullDaysOff?: number[] | undefined;
        partialDaysOff?: {
            day: number;
            weeks: number[];
        }[] | undefined;
    } | undefined;
}, {
    enabledMethods: ("manual" | "geofence" | "qr" | "face" | "ip" | "device" | "dynamic_qr" | "site")[];
    settings?: {
        requireLocation?: boolean | undefined;
        autoCheckoutTime?: string | undefined;
        overtimeThresholdMinutes?: number | undefined;
        lateMarkAfterMinutes?: number | undefined;
        halfDayThresholdHours?: number | undefined;
        requirePhotoOnCheckIn?: boolean | undefined;
        requireNoteOnLateCheckIn?: boolean | undefined;
        freeLateDaysPerMonth?: number | undefined;
    } | undefined;
    liveTracking?: {
        enabled?: boolean | undefined;
        intervalSeconds?: number | undefined;
    } | undefined;
    weekOff?: {
        fullDaysOff?: number[] | undefined;
        partialDaysOff?: {
            day: number;
            weeks?: number[] | undefined;
        }[] | undefined;
    } | undefined;
}>;
export declare function getConfig(_req: Request, res: Response): Promise<void>;
export declare function updateConfig(req: Request, res: Response): Promise<void>;
export declare const checkInSchema: z.ZodObject<{
    method: z.ZodEnum<["face", "qr", "dynamic_qr", "ip", "site", "geofence", "device", "manual"]>;
    location: z.ZodOptional<z.ZodObject<{
        lat: z.ZodOptional<z.ZodNumber>;
        lng: z.ZodOptional<z.ZodNumber>;
        accuracy: z.ZodOptional<z.ZodNumber>;
        address: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    }, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    }>>;
    photo: z.ZodOptional<z.ZodString>;
    deviceInfo: z.ZodOptional<z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        os: z.ZodOptional<z.ZodString>;
        appVersion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    }, {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    }>>;
    qrCode: z.ZodOptional<z.ZodString>;
    siteId: z.ZodOptional<z.ZodString>;
    geofenceId: z.ZodOptional<z.ZodString>;
    deviceId: z.ZodOptional<z.ZodString>;
    faceConfidence: z.ZodOptional<z.ZodNumber>;
    liveness: z.ZodOptional<z.ZodBoolean>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    method: "manual" | "geofence" | "qr" | "face" | "ip" | "device" | "dynamic_qr" | "site";
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    } | undefined;
    photo?: string | undefined;
    deviceInfo?: {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    } | undefined;
    qrCode?: string | undefined;
    siteId?: string | undefined;
    geofenceId?: string | undefined;
    deviceId?: string | undefined;
    faceConfidence?: number | undefined;
    liveness?: boolean | undefined;
    note?: string | undefined;
}, {
    method: "manual" | "geofence" | "qr" | "face" | "ip" | "device" | "dynamic_qr" | "site";
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    } | undefined;
    photo?: string | undefined;
    deviceInfo?: {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    } | undefined;
    qrCode?: string | undefined;
    siteId?: string | undefined;
    geofenceId?: string | undefined;
    deviceId?: string | undefined;
    faceConfidence?: number | undefined;
    liveness?: boolean | undefined;
    note?: string | undefined;
}>;
export declare const checkOutSchema: z.ZodObject<{
    location: z.ZodOptional<z.ZodObject<{
        lat: z.ZodOptional<z.ZodNumber>;
        lng: z.ZodOptional<z.ZodNumber>;
        accuracy: z.ZodOptional<z.ZodNumber>;
        address: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    }, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    }>>;
    photo: z.ZodOptional<z.ZodString>;
    deviceInfo: z.ZodOptional<z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        os: z.ZodOptional<z.ZodString>;
        appVersion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    }, {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    }>>;
    qrCode: z.ZodOptional<z.ZodString>;
    siteId: z.ZodOptional<z.ZodString>;
    geofenceId: z.ZodOptional<z.ZodString>;
    deviceId: z.ZodOptional<z.ZodString>;
    faceConfidence: z.ZodOptional<z.ZodNumber>;
    liveness: z.ZodOptional<z.ZodBoolean>;
    note: z.ZodOptional<z.ZodString>;
} & {
    method: z.ZodDefault<z.ZodEnum<["face", "qr", "dynamic_qr", "ip", "site", "geofence", "device", "manual"]>>;
}, "strip", z.ZodTypeAny, {
    method: "manual" | "geofence" | "qr" | "face" | "ip" | "device" | "dynamic_qr" | "site";
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    } | undefined;
    photo?: string | undefined;
    deviceInfo?: {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    } | undefined;
    qrCode?: string | undefined;
    siteId?: string | undefined;
    geofenceId?: string | undefined;
    deviceId?: string | undefined;
    faceConfidence?: number | undefined;
    liveness?: boolean | undefined;
    note?: string | undefined;
}, {
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
        accuracy?: number | undefined;
    } | undefined;
    method?: "manual" | "geofence" | "qr" | "face" | "ip" | "device" | "dynamic_qr" | "site" | undefined;
    photo?: string | undefined;
    deviceInfo?: {
        model?: string | undefined;
        os?: string | undefined;
        appVersion?: string | undefined;
    } | undefined;
    qrCode?: string | undefined;
    siteId?: string | undefined;
    geofenceId?: string | undefined;
    deviceId?: string | undefined;
    faceConfidence?: number | undefined;
    liveness?: boolean | undefined;
    note?: string | undefined;
}>;
export declare const breakStartSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["tea", "lunch", "personal", "other"]>>;
}, "strip", z.ZodTypeAny, {
    type: "other" | "tea" | "lunch" | "personal";
}, {
    type?: "other" | "tea" | "lunch" | "personal" | undefined;
}>;
export declare const breakEndSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function checkIn(req: Request, res: Response): Promise<void>;
export declare function checkOut(req: Request, res: Response): Promise<void>;
export declare function startBreak(req: Request, res: Response): Promise<void>;
export declare function endBreak(_req: Request, res: Response): Promise<void>;
export declare const listRecordsSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    employeeId: z.ZodOptional<z.ZodString>;
    departmentId: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["present", "absent", "half_day", "late", "on_leave", "holiday", "weekend"]>>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    month: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    status?: "present" | "absent" | "holiday" | "half_day" | "late" | "on_leave" | "weekend" | undefined;
    departmentId?: string | undefined;
    to?: Date | undefined;
    search?: string | undefined;
    employeeId?: string | undefined;
    from?: Date | undefined;
    month?: string | undefined;
}, {
    limit?: number | undefined;
    status?: "present" | "absent" | "holiday" | "half_day" | "late" | "on_leave" | "weekend" | undefined;
    departmentId?: string | undefined;
    to?: Date | undefined;
    page?: number | undefined;
    search?: string | undefined;
    employeeId?: string | undefined;
    from?: Date | undefined;
    month?: string | undefined;
}>;
export declare function listRecords(req: Request, res: Response): Promise<void>;
export declare function myAttendance(req: Request, res: Response): Promise<void>;
export declare function todayAttendance(_req: Request, res: Response): Promise<void>;
export declare function myShift(_req: Request, res: Response): Promise<void>;
export declare const monthlyQuerySchema: z.ZodObject<{
    year: z.ZodNumber;
    month: z.ZodNumber;
    employeeId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    month: number;
    year: number;
    employeeId?: string | undefined;
}, {
    month: number;
    year: number;
    employeeId?: string | undefined;
}>;
export declare function monthlyAttendance(req: Request, res: Response): Promise<void>;
export declare const regularizeSchema: z.ZodObject<{
    date: z.ZodDate;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: Date;
    reason: string;
}, {
    date: Date;
    reason: string;
}>;
export declare function requestRegularization(req: Request, res: Response): Promise<void>;
export declare const approveRegularizationSchema: z.ZodObject<{
    status: z.ZodEnum<["approved", "rejected"]>;
}, "strip", z.ZodTypeAny, {
    status: "approved" | "rejected";
}, {
    status: "approved" | "rejected";
}>;
export declare function decideRegularization(req: Request, res: Response): Promise<void>;
export declare const correctRecordSchema: z.ZodEffects<z.ZodObject<{
    checkIn: z.ZodOptional<z.ZodDate>;
    checkOut: z.ZodOptional<z.ZodDate>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    checkIn?: Date | undefined;
    checkOut?: Date | undefined;
}, {
    reason: string;
    checkIn?: Date | undefined;
    checkOut?: Date | undefined;
}>, {
    reason: string;
    checkIn?: Date | undefined;
    checkOut?: Date | undefined;
}, {
    reason: string;
    checkIn?: Date | undefined;
    checkOut?: Date | undefined;
}>;
/**
 * PATCH /api/v1/attendance/records/:id — HR corrects a check-in/check-out.
 *
 * Employees forget to check out, which leaves the day stored as 0 hours (the
 * timestamps are there but the total is only written at check-out). There was
 * no way to fix such a record: `/check-out` only ever acts on the *caller's*
 * own record, so an admin could not close someone else's day. This closes it
 * on their behalf and recomputes hours, overtime and half-day status with the
 * same rules a normal check-out uses.
 */
export declare function correctRecord(req: Request, res: Response): Promise<void>;
export declare const reportQuerySchema: z.ZodObject<{
    from: z.ZodDate;
    to: z.ZodDate;
    departmentId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    to: Date;
    from: Date;
    departmentId?: string | undefined;
}, {
    to: Date;
    from: Date;
    departmentId?: string | undefined;
}>;
export declare function dashboardStats(req: Request, res: Response): Promise<void>;
export declare function attendanceReport(req: Request, res: Response): Promise<void>;
export declare const trackingBatchSchema: z.ZodObject<{
    points: z.ZodArray<z.ZodObject<{
        timestamp: z.ZodOptional<z.ZodDate>;
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        accuracy: z.ZodOptional<z.ZodNumber>;
        speed: z.ZodOptional<z.ZodNumber>;
        altitude: z.ZodOptional<z.ZodNumber>;
        heading: z.ZodOptional<z.ZodNumber>;
        activity: z.ZodOptional<z.ZodEnum<["still", "walking", "running", "in_vehicle"]>>;
        battery: z.ZodOptional<z.ZodNumber>;
        isCharging: z.ZodOptional<z.ZodBoolean>;
        networkType: z.ZodOptional<z.ZodString>;
        isOffline: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
        timestamp?: Date | undefined;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
        timestamp?: Date | undefined;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    points: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
        timestamp?: Date | undefined;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }[];
}, {
    points: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
        timestamp?: Date | undefined;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }[];
}>;
export declare function ingestLocationBatch(req: Request, res: Response): Promise<void>;
export declare function getLiveTracking(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=attendance.controller.d.ts.map