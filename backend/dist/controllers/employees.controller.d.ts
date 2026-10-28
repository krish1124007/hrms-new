import type { Request, Response } from 'express';
import { z } from 'zod';
import { type EmployeeStatus } from '../models/employee.model.js';
export declare const createEmployeeSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodString;
    personalEmail: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    dateOfBirth: z.ZodOptional<z.ZodDate>;
    gender: z.ZodOptional<z.ZodEnum<["male", "female", "other"]>>;
    maritalStatus: z.ZodOptional<z.ZodEnum<["single", "married", "divorced", "widowed"]>>;
    bloodGroup: z.ZodOptional<z.ZodString>;
    profileImage: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodObject<{
        current: z.ZodOptional<z.ZodObject<{
            line1: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            line2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            state: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            country: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            zip: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }>>;
        permanent: z.ZodOptional<z.ZodObject<{
            line1: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            line2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            state: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            country: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            zip: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    }, {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    }>>;
    department: z.ZodOptional<z.ZodString>;
    designation: z.ZodOptional<z.ZodString>;
    shift: z.ZodOptional<z.ZodString>;
    /** Force this employee to share location when clocking in / out. */
    requireLocation: z.ZodOptional<z.ZodBoolean>;
    /** Field staff — drives the expense-before-checkout rule. */
    isFieldStaff: z.ZodOptional<z.ZodBoolean>;
    /** Salary structure this employee's pay components come from. */
    salaryStructureId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    reportingManager: z.ZodOptional<z.ZodString>;
    joiningDate: z.ZodDate;
    confirmationDate: z.ZodOptional<z.ZodDate>;
    employmentType: z.ZodDefault<z.ZodEnum<["full-time", "part-time", "contract", "intern"]>>;
    workLocation: z.ZodOptional<z.ZodString>;
    salary: z.ZodOptional<z.ZodObject<{
        basic: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        hra: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        da: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        specialAllowance: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        otherAllowances: z.ZodOptional<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
        tdsMonthly: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    }, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    }>>;
    bankDetails: z.ZodOptional<z.ZodObject<{
        bankName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        accountNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        ifscCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        panNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    }, {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    }>>;
    emergencyContact: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        relation: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    }, {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    }>>;
    probationEndDate: z.ZodOptional<z.ZodDate>;
    noticePeriod: z.ZodOptional<z.ZodNumber>;
    createUserAccount: z.ZodDefault<z.ZodBoolean>;
    roleId: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    firstName: string;
    lastName: string;
    email: string;
    joiningDate: Date;
    employmentType: "full-time" | "part-time" | "contract" | "intern";
    createUserAccount: boolean;
    personalEmail?: string | undefined;
    phone?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
    shift?: string | undefined;
    address?: {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    } | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    requireLocation?: boolean | undefined;
    isFieldStaff?: boolean | undefined;
    salaryStructureId?: string | null | undefined;
    reportingManager?: string | undefined;
    confirmationDate?: Date | undefined;
    workLocation?: string | undefined;
    salary?: {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    } | undefined;
    probationEndDate?: Date | undefined;
    noticePeriod?: number | undefined;
    roleId?: string | undefined;
    password?: string | undefined;
}, {
    firstName: string;
    lastName: string;
    email: string;
    joiningDate: Date;
    personalEmail?: string | undefined;
    phone?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
    shift?: string | undefined;
    address?: {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    } | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    requireLocation?: boolean | undefined;
    isFieldStaff?: boolean | undefined;
    salaryStructureId?: string | null | undefined;
    reportingManager?: string | undefined;
    confirmationDate?: Date | undefined;
    employmentType?: "full-time" | "part-time" | "contract" | "intern" | undefined;
    workLocation?: string | undefined;
    salary?: {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    } | undefined;
    probationEndDate?: Date | undefined;
    noticePeriod?: number | undefined;
    createUserAccount?: boolean | undefined;
    roleId?: string | undefined;
    password?: string | undefined;
}>;
export declare const updateEmployeeSchema: z.ZodObject<Omit<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    personalEmail: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    dateOfBirth: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    gender: z.ZodOptional<z.ZodOptional<z.ZodEnum<["male", "female", "other"]>>>;
    maritalStatus: z.ZodOptional<z.ZodOptional<z.ZodEnum<["single", "married", "divorced", "widowed"]>>>;
    bloodGroup: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    profileImage: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        current: z.ZodOptional<z.ZodObject<{
            line1: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            line2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            state: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            country: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            zip: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }>>;
        permanent: z.ZodOptional<z.ZodObject<{
            line1: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            line2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            state: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            country: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            zip: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    }, {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    }>>>;
    department: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    designation: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    shift: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    requireLocation: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    isFieldStaff: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    salaryStructureId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    reportingManager: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    joiningDate: z.ZodOptional<z.ZodDate>;
    confirmationDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    employmentType: z.ZodOptional<z.ZodDefault<z.ZodEnum<["full-time", "part-time", "contract", "intern"]>>>;
    workLocation: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    salary: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        basic: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        hra: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        da: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        specialAllowance: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        otherAllowances: z.ZodOptional<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
        tdsMonthly: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    }, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    }>>>;
    bankDetails: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        bankName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        accountNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        ifscCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        panNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    }, {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    }>>>;
    emergencyContact: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        relation: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    }, {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    }>>>;
    probationEndDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    noticePeriod: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    createUserAccount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    roleId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    password: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "createUserAccount" | "roleId">, "strip", z.ZodTypeAny, {
    firstName?: string | undefined;
    lastName?: string | undefined;
    email?: string | undefined;
    personalEmail?: string | undefined;
    phone?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
    shift?: string | undefined;
    address?: {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    } | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    requireLocation?: boolean | undefined;
    isFieldStaff?: boolean | undefined;
    salaryStructureId?: string | null | undefined;
    reportingManager?: string | undefined;
    joiningDate?: Date | undefined;
    confirmationDate?: Date | undefined;
    employmentType?: "full-time" | "part-time" | "contract" | "intern" | undefined;
    workLocation?: string | undefined;
    salary?: {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    } | undefined;
    probationEndDate?: Date | undefined;
    noticePeriod?: number | undefined;
    password?: string | undefined;
}, {
    firstName?: string | undefined;
    lastName?: string | undefined;
    email?: string | undefined;
    personalEmail?: string | undefined;
    phone?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
    shift?: string | undefined;
    address?: {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    } | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    requireLocation?: boolean | undefined;
    isFieldStaff?: boolean | undefined;
    salaryStructureId?: string | null | undefined;
    reportingManager?: string | undefined;
    joiningDate?: Date | undefined;
    confirmationDate?: Date | undefined;
    employmentType?: "full-time" | "part-time" | "contract" | "intern" | undefined;
    workLocation?: string | undefined;
    salary?: {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
        tdsMonthly?: number | undefined;
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    } | undefined;
    probationEndDate?: Date | undefined;
    noticePeriod?: number | undefined;
    password?: string | undefined;
}>;
export declare const updateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["active", "inactive", "terminated", "resigned", "onNotice"]>;
    reason: z.ZodOptional<z.ZodString>;
    exitDate: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "inactive" | "terminated" | "resigned" | "onNotice";
    reason?: string | undefined;
    exitDate?: Date | null | undefined;
}, {
    status: "active" | "inactive" | "terminated" | "resigned" | "onNotice";
    reason?: string | undefined;
    exitDate?: Date | null | undefined;
}>;
export declare const addDocumentSchema: z.ZodObject<{
    type: z.ZodString;
    name: z.ZodString;
    fileUrl: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    type: string;
    name: string;
    fileUrl: string;
}, {
    type: string;
    name: string;
    fileUrl: string;
}>;
export declare const importEmployeesSchema: z.ZodObject<{
    employees: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>, "many">;
}, "strip", z.ZodTypeAny, {
    employees: Record<string, any>[];
}, {
    employees: Record<string, any>[];
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
    designation: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["active", "inactive", "terminated", "resigned", "onNotice"]>>;
    sort: z.ZodOptional<z.ZodString>;
    /** `1` / `true`: soft-deleted employees too — honoured for `employees.delete` holders only. */
    includeDeleted: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    sort?: string | undefined;
    status?: "active" | "inactive" | "terminated" | "resigned" | "onNotice" | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    search?: string | undefined;
    includeDeleted?: string | undefined;
}, {
    sort?: string | undefined;
    status?: "active" | "inactive" | "terminated" | "resigned" | "onNotice" | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    includeDeleted?: string | undefined;
}>;
export declare function listEmployees(req: Request, res: Response): Promise<void>;
export declare function employeeStats(_req: Request, res: Response): Promise<void>;
export declare function createEmployee(req: Request, res: Response): Promise<void>;
/** `POST /employees/logins`: the employees to give a login; none listed = every employed one without. */
export declare const createLoginsSchema: z.ZodObject<{
    employeeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    employeeIds?: string[] | undefined;
}, {
    employeeIds?: string[] | undefined;
}>;
/**
 * A random starting password HR hands to the employee: 10 characters, at
 * least two of them digits, so it passes `validatePasswordStrength`.
 */
export declare function startingPassword(): string;
/** A login just made for an employee. `password` is shown once and never stored in plain. */
export interface CreatedLogin {
    employee: {
        _id: string;
        employeeId: string;
        name: string;
    };
    email: string;
    role: string;
    /** Absent when an existing, unlinked login with this e-mail was linked instead — its password is unchanged. */
    password?: string;
}
/** `GET /employees/without-login` — employed people who cannot sign in yet because they have no login. */
export declare function listEmployeesWithoutLogin(_req: Request, res: Response): Promise<void>;
/** `POST /employees/:id/login` — a login for one employee; the starting password is in the answer, once. */
export declare function createEmployeeLogin(req: Request, res: Response): Promise<void>;
/**
 * `POST /employees/logins` — logins for the listed employees, or for every
 * employed one without a login. One that cannot be given a login is skipped
 * with the reason; the rest are still created.
 */
export declare function createEmployeeLogins(req: Request, res: Response): Promise<void>;
export declare function getEmployee(req: Request, res: Response): Promise<void>;
/** GET /employees/me — any logged-in user's own employee profile. */
export declare function getMyProfile(req: Request, res: Response): Promise<void>;
/**
 * What an employee may change about themselves: contact details only. Strict —
 * any other key (salary, department, status…) is a 400, never silently dropped.
 * An empty string clears `phone`, `personalEmail` or `avatar`.
 */
export declare const updateSelfSchema: z.ZodObject<{
    phone: z.ZodOptional<z.ZodString>;
    personalEmail: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"">, z.ZodString]>>;
    address: z.ZodOptional<z.ZodObject<{
        current: z.ZodOptional<z.ZodObject<{
            line1: z.ZodOptional<z.ZodString>;
            line2: z.ZodOptional<z.ZodString>;
            city: z.ZodOptional<z.ZodString>;
            state: z.ZodOptional<z.ZodString>;
            country: z.ZodOptional<z.ZodString>;
            zip: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }>>;
        permanent: z.ZodOptional<z.ZodObject<{
            line1: z.ZodOptional<z.ZodString>;
            line2: z.ZodOptional<z.ZodString>;
            city: z.ZodOptional<z.ZodString>;
            state: z.ZodOptional<z.ZodString>;
            country: z.ZodOptional<z.ZodString>;
            zip: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }, {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    }, {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    }>>;
    emergencyContact: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        relation: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    }, {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    }>>;
    avatar: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"">, z.ZodString]>>;
}, "strict", z.ZodTypeAny, {
    personalEmail?: string | undefined;
    phone?: string | undefined;
    address?: {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    } | undefined;
    emergencyContact?: {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    } | undefined;
    avatar?: string | undefined;
}, {
    personalEmail?: string | undefined;
    phone?: string | undefined;
    address?: {
        current?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
        permanent?: {
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            state?: string | undefined;
            country?: string | undefined;
            zip?: string | undefined;
        } | undefined;
    } | undefined;
    emergencyContact?: {
        phone?: string | undefined;
        name?: string | undefined;
        relation?: string | undefined;
    } | undefined;
    avatar?: string | undefined;
}>;
/**
 * PATCH /employees/me — the caller updates their own contact details. The
 * given part of the address / emergency contact is merged into what is
 * stored; a new avatar is mirrored to the login so the app header matches.
 */
export declare function updateMyProfile(req: Request, res: Response): Promise<void>;
export declare const directoryQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    department?: string | undefined;
    search?: string | undefined;
}, {
    department?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
}>;
/** GET /employees/directory — employed colleagues, searchable by name, e-mail or Employee ID. */
export declare function listDirectory(req: Request, res: Response): Promise<void>;
/** GET /employees/directory/stats — headcount of employed people, in total and per department. */
export declare function directoryStats(_req: Request, res: Response): Promise<void>;
/** GET /employees/directory/:id — one employed colleague; 404 for anyone who has left or was deleted. */
export declare function getDirectoryEntry(req: Request, res: Response): Promise<void>;
export declare function updateEmployee(req: Request, res: Response): Promise<void>;
export declare function deleteEmployee(req: Request, res: Response): Promise<void>;
/**
 * POST /employees/:id/restore — bring back a soft-deleted employee, and — if
 * they are employed — the login the delete deactivated. A login that was
 * still `invited` (never accepted) stays invited.
 */
export declare function restoreEmployee(req: Request, res: Response): Promise<void>;
/**
 * Change an employee's employment status.
 *
 *   • `active` — employed again; any scheduled exit is dropped and the login
 *     reactivated.
 *   • `onNotice` — serving notice; with an `exitDate` the exit is scheduled
 *     for it (`resigned`), applied by the day-close after that day.
 *   • `resigned` / `terminated` / `inactive` with an `exitDate` after today
 *     (business day) — only scheduled: the employee stays as they are, login
 *     included, until the day-close after `exitDate` applies it
 *     (`applyScheduledExits`). Otherwise — no date, or today or earlier — it
 *     applies now: approved leave starting after today is cancelled and
 *     refunded, the login deactivated, and HR told what to recover.
 */
export declare function updateEmployeeStatus(req: Request, res: Response): Promise<void>;
export interface StatusChange {
    status: EmployeeStatus;
    /** Absent or null: no date. */
    exitDate?: Date | null;
    reason?: string;
}
export declare function addEmployeeDocument(req: Request, res: Response): Promise<void>;
export declare function deleteEmployeeDocument(req: Request, res: Response): Promise<void>;
/** CSV of work details (no pay fields) — of everybody for HR / payroll, else of the caller and their reports. */
export declare function exportEmployees(req: Request, res: Response): Promise<void>;
/** One row of an import, as reported back (`row` is 1-based, in payload order). */
export interface ImportRowResult {
    row: number;
    email?: string;
    employeeId?: string;
    status: 'created' | 'updated' | 'skipped' | 'error';
    message: string;
}
/**
 * POST /employees/import — one row per employee. A new e-mail creates the
 * employee with a login exactly as `createEmployee` does (an `invited` user
 * and the accept-invite mail, unless the row sets a password), keeping the
 * row's Employee ID when it has one; a known e-mail updates that employee
 * through the same safe update as PATCH. Every row is reported as `created`,
 * `updated`, `skipped` (a deleted employee has that e-mail) or `error`;
 * `failed` lists the last two the way older clients read it.
 */
export declare function importEmployees(req: Request, res: Response): Promise<void>;
export declare function upcomingBirthdays(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=employees.controller.d.ts.map