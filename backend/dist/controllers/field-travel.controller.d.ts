/**
 * Travel allowance by km (scope §8): a day's km are the legs between that
 * day's check-in/out points (services/field-route.service.ts). The employee
 * claims a day in one step; the claim is an ordinary expense claim in the
 * "Travel allowance" category (created on first use) and goes through the
 * normal expense approval, with the computed and the claimed km side by side
 * (`travel`).
 *
 * Rules: one live claim per employee per day (a rejected or withdrawn one
 * frees the day) — 409 `TA_ALREADY_CLAIMED`; a day needs a completed visit —
 * 400 `NO_FIELD_WORK`; claimed km more than 5 % off the computed km need a
 * reason — 400 `REASON_REQUIRED`; amount = round(km × the vehicle's ₹/km).
 */
import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { type IExpenseCategory } from '../models/expense-category.model.js';
export declare const TRAVEL_CATEGORY_NAME = "Travel allowance";
export declare const TRAVEL_CATEGORY_CODE = "TRAVEL_ALLOWANCE";
/** Claimed km may differ from the computed km by this share without a reason. */
export declare const KM_TOLERANCE = 0.05;
export declare const travelDayQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
}, {
    date?: string | undefined;
}>;
export declare const travelClaimSchema: z.ZodObject<{
    date: z.ZodEffects<z.ZodString, string, string>;
    vehicleType: z.ZodEnum<["bike", "car", "other"]>;
    /** Omitted → the computed km. */
    km: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date: string;
    vehicleType: "other" | "bike" | "car";
    reason?: string | undefined;
    km?: number | undefined;
}, {
    date: string;
    vehicleType: "other" | "bike" | "car";
    reason?: string | undefined;
    km?: number | undefined;
}>;
/** `<employeeId>:<YYYY-MM-DD>` — unique among live travel claims. */
export declare const travelKeyOf: (employeeId: Types.ObjectId | string, date: string) => string;
/** Whether claiming `claimedKm` against `computedKm` needs a reason (same rule as the web form). */
export declare function kmNeedsReason(computedKm: number, claimedKm: number): boolean;
/**
 * The "Travel allowance" expense category: an existing one of that name
 * (any case), else the one holding code TRAVEL_ALLOWANCE — restored if it was
 * deleted — else a new one (no bill needed: the km are the evidence).
 */
export declare function travelAllowanceCategory(): Promise<IExpenseCategory>;
/**
 * `GET /field/travel/day?date=YYYY-MM-DD` (self) — `{ date, totalKm,
 * estimated, points, legs, hasCompletedVisit, claim: { _id, status, km,
 * amount } | null }`.
 */
export declare function travelDay(req: Request, res: Response): Promise<void>;
/**
 * `POST /field/travel/claims` (self) `{ date, vehicleType, km?, reason? }` →
 * 201 the expense claim (category populated), pending approval.
 */
export declare function createTravelClaim(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-travel.controller.d.ts.map