import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type ExpenseClaimStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'reimbursed';
export type ExpensePaymentMethod = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'other';
export interface IExpenseReceipt {
    name: string;
    fileUrl: string;
    uploadedAt: Date;
}
export type TravelVehicleType = 'bike' | 'car' | 'other';
/** A point of the travelled day, as the route showed it when the claim was made. */
export interface IExpenseTravelPoint {
    lat: number;
    lng: number;
    at: Date;
    kind: 'day_in' | 'visit_in' | 'visit_out' | 'day_out';
    siteName?: string;
}
/**
 * How a travel allowance claim (`POST /field/travel/claims`) was worked out:
 * the km measured between the day's check-in/out points (`computedKm`, with
 * the route's points and legs kept for the approver), the km claimed and why
 * they differ, and the vehicle's rate. `amount = round(claimedKm × ratePerKm)`.
 */
export interface IExpenseTravel {
    /** IST calendar day travelled, `YYYY-MM-DD`. */
    date: string;
    vehicleType: TravelVehicleType;
    ratePerKm: number;
    computedKm: number;
    claimedKm: number;
    /** Some leg used the straight-line × 1.3 estimate (no road distance). */
    estimated: boolean;
    reason?: string;
    points: IExpenseTravelPoint[];
    legs: {
        fromIndex: number;
        toIndex: number;
        distanceM: number;
        estimated: boolean;
    }[];
}
export interface IExpenseClaim extends Document {
    employeeId: Types.ObjectId;
    category: Types.ObjectId;
    amount: number;
    acceptedAmount?: number;
    currency: string;
    date: Date;
    description?: string;
    receiptUrls: IExpenseReceipt[];
    paymentMethod?: ExpensePaymentMethod;
    status: ExpenseClaimStatus;
    approvedBy?: Types.ObjectId;
    approvedAt?: Date;
    rejectedReason?: string;
    reimbursedAt?: Date;
    reimbursementRef?: string;
    /** The payroll cycle that paid this claim out, when payroll reimbursed it. */
    payrollCycleId?: Types.ObjectId;
    /** Set on travel allowance claims. */
    travel?: IExpenseTravel;
    /**
     * `<employeeId>:<YYYY-MM-DD>` while a travel claim is live (not rejected,
     * not deleted) — unique, so one employee has one travel claim per day.
     */
    travelKey?: string;
    /** The field visit this expense was incurred at. */
    visitId?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ExpenseClaim: PaginateModel<IExpenseClaim> & Model<IExpenseClaim, {}, {}, {}, Document<unknown, {}, IExpenseClaim, {}, {}> & IExpenseClaim & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=expense-claim.model.d.ts.map