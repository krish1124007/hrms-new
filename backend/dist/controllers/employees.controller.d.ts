import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createEmployeeSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodString;
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
    }, "strip", z.ZodTypeAny, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
    }, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
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
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
    }, {
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
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
    shift?: string | undefined;
    phone?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
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
    reportingManager?: string | undefined;
    confirmationDate?: Date | undefined;
    workLocation?: string | undefined;
    salary?: {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
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
    shift?: string | undefined;
    phone?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
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
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
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
    }, "strip", z.ZodTypeAny, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
    }, {
        basic?: number | undefined;
        hra?: number | undefined;
        da?: number | undefined;
        specialAllowance?: number | undefined;
        otherAllowances?: Record<string, number> | undefined;
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
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
    }, {
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
    }>>>;
    probationEndDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    noticePeriod: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    createUserAccount: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    roleId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    password: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "createUserAccount" | "roleId">, "strip", z.ZodTypeAny, {
    shift?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    email?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
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
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
    } | undefined;
    probationEndDate?: Date | undefined;
    noticePeriod?: number | undefined;
    password?: string | undefined;
}, {
    shift?: string | undefined;
    phone?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    email?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "male" | "female" | "other" | undefined;
    maritalStatus?: "single" | "married" | "divorced" | "widowed" | undefined;
    bloodGroup?: string | undefined;
    profileImage?: string | undefined;
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
    } | undefined;
    bankDetails?: {
        bankName?: string | undefined;
        accountNumber?: string | undefined;
        ifscCode?: string | undefined;
        panNumber?: string | undefined;
    } | undefined;
    emergencyContact?: {
        name?: string | undefined;
        relation?: string | undefined;
        phone?: string | undefined;
    } | undefined;
    probationEndDate?: Date | undefined;
    noticePeriod?: number | undefined;
    password?: string | undefined;
}>;
export declare const updateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["active", "inactive", "terminated", "resigned", "onNotice"]>;
    reason: z.ZodOptional<z.ZodString>;
    exitDate: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "inactive" | "terminated" | "resigned" | "onNotice";
    reason?: string | undefined;
    exitDate?: Date | undefined;
}, {
    status: "active" | "inactive" | "terminated" | "resigned" | "onNotice";
    reason?: string | undefined;
    exitDate?: Date | undefined;
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
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    sort?: string | undefined;
    status?: "active" | "inactive" | "terminated" | "resigned" | "onNotice" | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    search?: string | undefined;
}, {
    sort?: string | undefined;
    status?: "active" | "inactive" | "terminated" | "resigned" | "onNotice" | undefined;
    department?: string | undefined;
    designation?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
}>;
export declare function listEmployees(req: Request, res: Response): Promise<void>;
export declare function employeeStats(_req: Request, res: Response): Promise<void>;
export declare function createEmployee(req: Request, res: Response): Promise<void>;
export declare function getEmployee(req: Request, res: Response): Promise<void>;
export declare function updateEmployee(req: Request, res: Response): Promise<void>;
export declare function deleteEmployee(req: Request, res: Response): Promise<void>;
export declare function updateEmployeeStatus(req: Request, res: Response): Promise<void>;
export declare function addEmployeeDocument(req: Request, res: Response): Promise<void>;
export declare function deleteEmployeeDocument(req: Request, res: Response): Promise<void>;
export declare function exportEmployees(_req: Request, res: Response): Promise<void>;
export declare function importEmployees(req: Request, res: Response): Promise<void>;
export declare function upcomingBirthdays(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=employees.controller.d.ts.map