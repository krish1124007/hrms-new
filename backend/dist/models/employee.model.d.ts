import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type Gender = 'male' | 'female' | 'other';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'intern';
export type EmployeeStatus = 'active' | 'inactive' | 'terminated' | 'resigned' | 'onNotice';
/** The statuses an exit can end in. */
export type ExitStatus = 'resigned' | 'terminated' | 'inactive';
export interface IAddress {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
}
export interface ISalary {
    basic: number;
    hra: number;
    da: number;
    specialAllowance: number;
    otherAllowances: Record<string, number>;
    grossSalary: number;
    /** Monthly TDS to deduct, declared by HR. */
    tdsMonthly?: number;
}
/** Statutory flags that carry state across payroll months. */
export interface IEmployeeStatutory {
    /** Whether ESI applies to this employee (decided against the wage ceiling). */
    esiEligible?: boolean;
    /** The ESI contribution period `esiEligible` was decided for: `YYYY-H1` (Apr–Sep) or `YYYY-H2` (Oct–Mar), named for the year it began (Feb 2027 → `2026-H2`). */
    esiPeriodKey?: string;
}
export interface IBankDetails {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    panNumber?: string;
}
export interface IEmployeeDocument {
    _id?: Types.ObjectId;
    type: string;
    name: string;
    fileUrl: string;
    uploadedAt: Date;
}
export interface IEmergencyContact {
    name?: string;
    relation?: string;
    phone?: string;
}
export interface IEmployee extends Document {
    userId?: Types.ObjectId;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    dateOfBirth?: Date;
    gender?: Gender;
    maritalStatus?: MaritalStatus;
    bloodGroup?: string;
    profileImage?: string;
    /** Location is mandatory for this employee's check-in / check-out. */
    requireLocation?: boolean;
    address: {
        current?: IAddress;
        permanent?: IAddress;
    };
    department?: Types.ObjectId;
    designation?: Types.ObjectId;
    shift?: Types.ObjectId;
    reportingManager?: Types.ObjectId;
    joiningDate: Date;
    confirmationDate?: Date;
    employmentType: EmploymentType;
    workLocation?: string;
    salary: ISalary;
    /** Field staff: location and expense-before-checkout rules apply to them. */
    isFieldStaff?: boolean;
    /** The salary structure this employee's pay components come from. */
    salaryStructureId?: Types.ObjectId;
    statutory?: IEmployeeStatutory;
    bankDetails: IBankDetails;
    documents: IEmployeeDocument[];
    emergencyContact: IEmergencyContact;
    status: EmployeeStatus;
    /**
     * Last working day. When it lies in the future the exit is only scheduled:
     * the employee stays `active` / `onNotice` until the day-close after it
     * applies `exitStatus`.
     */
    exitDate?: Date;
    /**
     * The status the recorded exit ends in: set when an exit is scheduled
     * (applied as `resigned` when unset) and kept once it has been applied.
     */
    exitStatus?: ExitStatus;
    exitReason?: string;
    probationEndDate?: Date;
    noticePeriod?: number;
    assetName?: string;
    assetCode?: string;
    category?: string;
    condition?: string;
    fullName: string;
    isDeleted: boolean;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Employee: PaginateModel<IEmployee> & Model<IEmployee, {}, {}, {}, Document<unknown, {}, IEmployee, {}, {}> & IEmployee & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=employee.model.d.ts.map