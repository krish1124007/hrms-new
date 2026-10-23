import { z } from 'zod';
import { ExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { AppError, ValidationAppError } from '../lib/errors.js';
import { requireOwnEmployeeId } from '../lib/field-access.js';
import { escapeRegex } from '../lib/regex.js';
import { audit } from '../services/audit.service.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import { dateKeySchema, dayRoute, fieldDay, publicPoint } from '../services/field-route.service.js';
import { notifyManagerOfClaim } from './expense-claims.controller.js';
export const TRAVEL_CATEGORY_NAME = 'Travel allowance';
export const TRAVEL_CATEGORY_CODE = 'TRAVEL_ALLOWANCE';
/** Claimed km may differ from the computed km by this share without a reason. */
export const KM_TOLERANCE = 0.05;
export const travelDayQuerySchema = z.object({ date: dateKeySchema.optional() });
export const travelClaimSchema = z.object({
    date: dateKeySchema,
    vehicleType: z.enum(['bike', 'car', 'other']),
    /** Omitted → the computed km. */
    km: z.coerce.number().finite().min(0).max(5000).optional(),
    reason: z.string().trim().max(500).optional(),
});
/** `<employeeId>:<YYYY-MM-DD>` — unique among live travel claims. */
export const travelKeyOf = (employeeId, date) => `${String(employeeId)}:${date}`;
const round2 = (n) => Math.round(n * 100) / 100;
/** Whether claiming `claimedKm` against `computedKm` needs a reason (same rule as the web form). */
export function kmNeedsReason(computedKm, claimedKm) {
    if (computedKm <= 0)
        return claimedKm > 0;
    // A hair of slack so float noise (42 against 40 → 5.0000001 %) is not "more than 5 %".
    return Math.abs(claimedKm - computedKm) / computedKm > KM_TOLERANCE + 1e-9;
}
const isDuplicateKey = (err) => err?.code === 11000;
const alreadyClaimed = (date) => new AppError(`You have already claimed travel allowance for ${date}`, 409, 'TA_ALREADY_CLAIMED');
/**
 * The "Travel allowance" expense category: an existing one of that name
 * (any case), else the one holding code TRAVEL_ALLOWANCE — restored if it was
 * deleted — else a new one (no bill needed: the km are the evidence).
 */
export async function travelAllowanceCategory() {
    const byName = await ExpenseCategory.findOne({
        name: { $regex: `^${escapeRegex(TRAVEL_CATEGORY_NAME)}$`, $options: 'i' },
    })
        .sort({ createdAt: 1 })
        .exec();
    if (byName)
        return byName;
    try {
        return await ExpenseCategory.findOneAndUpdate({ code: TRAVEL_CATEGORY_CODE }, {
            $setOnInsert: {
                name: TRAVEL_CATEGORY_NAME,
                description: 'Kilometres travelled on field work × the rate per km (claimed from Field Visits)',
                requiresReceipt: false,
                isActive: true,
            },
        }, { upsert: true, new: true }).orFail();
    }
    catch (err) {
        if (!isDuplicateKey(err))
            throw err;
        // Another request created it meanwhile, or a deleted category holds the code.
        const existing = await ExpenseCategory.findOne({ code: TRAVEL_CATEGORY_CODE }).setOptions({ withDeleted: true }).exec();
        if (!existing)
            throw err;
        if (existing.get('isDeleted')) {
            await ExpenseCategory.updateOne({ _id: existing._id }, { $set: { isDeleted: false, deletedAt: null } })
                .setOptions({ withDeleted: true })
                .exec();
            existing.set('isDeleted', false);
        }
        return existing;
    }
}
/** The claim for that day: the live one, else the newest (a rejected one). */
async function claimForDay(employeeId, date) {
    const claims = await ExpenseClaim.find({ employeeId, 'travel.date': date })
        .sort({ createdAt: -1 })
        .select('+travelKey status amount travel.claimedKm')
        .exec();
    return claims.find((c) => c.travelKey) ?? claims[0] ?? null;
}
/**
 * `GET /field/travel/day?date=YYYY-MM-DD` (self) — `{ date, totalKm,
 * estimated, points, legs, hasCompletedVisit, claim: { _id, status, km,
 * amount } | null }`.
 */
export async function travelDay(req, res) {
    const employeeId = await requireOwnEmployeeId(req);
    const day = fieldDay(req.query.date);
    const [{ data, route }, claim] = await Promise.all([dayRoute(employeeId, day.date), claimForDay(employeeId, day.date)]);
    res.json({
        success: true,
        data: {
            date: day.date,
            totalKm: route.totalKm,
            estimated: route.estimated,
            points: route.points.map(publicPoint),
            legs: route.legs,
            hasCompletedVisit: data.visits.some((v) => v.status === 'completed'),
            claim: claim
                ? { _id: String(claim._id), status: claim.status, km: claim.travel?.claimedKm ?? 0, amount: claim.amount }
                : null,
        },
    });
}
/**
 * `POST /field/travel/claims` (self) `{ date, vehicleType, km?, reason? }` →
 * 201 the expense claim (category populated), pending approval.
 */
export async function createTravelClaim(req, res) {
    const body = req.body;
    const employeeId = await requireOwnEmployeeId(req);
    const day = fieldDay(body.date);
    const settings = await getFieldSettings();
    const vehicle = settings.vehicles.find((v) => v.type === body.vehicleType);
    if (!vehicle) {
        throw new AppError(`"${body.vehicleType}" is not one of the vehicles in the field settings`, 400, 'UNKNOWN_VEHICLE');
    }
    if (!(vehicle.ratePerKm > 0)) {
        throw new AppError(`No rate per km is set for ${vehicle.label} — ask HR to set it in the field settings`, 400, 'VEHICLE_RATE_NOT_SET');
    }
    const travelKey = travelKeyOf(employeeId, day.date);
    if (await ExpenseClaim.exists({ travelKey }).exec())
        throw alreadyClaimed(day.date);
    const { data, route } = await dayRoute(employeeId, day.date);
    if (!data.visits.some((v) => v.status === 'completed')) {
        throw new AppError(`You have no completed visit on ${day.date}, so there is no field travel to claim`, 400, 'NO_FIELD_WORK');
    }
    const computedKm = route.totalKm;
    const claimedKm = body.km === undefined ? computedKm : round2(body.km);
    const reason = body.reason ? body.reason : undefined;
    if (!reason && kmNeedsReason(computedKm, claimedKm)) {
        throw new AppError(`${claimedKm} km differs from the ${computedKm} km measured for the day by more than 5 % — give a reason`, 400, 'REASON_REQUIRED');
    }
    const amount = Math.round(claimedKm * vehicle.ratePerKm);
    if (amount <= 0)
        throw new AppError('Nothing to claim: the distance comes to ₹0', 400, 'NOTHING_TO_CLAIM');
    const category = await travelAllowanceCategory();
    if (category.limit && amount > category.limit) {
        throw new ValidationAppError(`Amount exceeds category limit of ${category.limit}`);
    }
    let claim;
    try {
        claim = await ExpenseClaim.create({
            employeeId,
            category: category._id,
            amount,
            currency: 'INR',
            date: day.label,
            description: `Travel allowance: ${claimedKm} km by ${vehicle.label} on ${day.date}`,
            receiptUrls: [],
            status: 'pending',
            travel: {
                date: day.date,
                vehicleType: vehicle.type,
                ratePerKm: vehicle.ratePerKm,
                computedKm,
                claimedKm,
                estimated: route.estimated,
                ...(reason ? { reason } : {}),
                points: route.points.map(publicPoint),
                legs: route.legs,
            },
            travelKey,
        });
    }
    catch (err) {
        if (isDuplicateKey(err))
            throw alreadyClaimed(day.date);
        throw err;
    }
    void audit({ action: 'create', entity: 'ExpenseClaim', entityId: String(claim._id), metadata: { travel: day.date } });
    await notifyManagerOfClaim(claim);
    const out = await ExpenseClaim.findById(claim._id).populate('category', 'name code').exec();
    res.status(201).json({ success: true, data: out });
}
//# sourceMappingURL=field-travel.controller.js.map