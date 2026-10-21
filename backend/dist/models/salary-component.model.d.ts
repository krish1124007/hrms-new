import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type ComponentType = 'earning' | 'deduction' | 'employer_contribution';
export type CalculationType = 'fixed' | 'percentage_of_basic' | 'percentage_of_gross';
export type StatutoryType = 'pf_employee' | 'pf_employer' | 'esic_employee' | 'esic_employer' | 'professional_tax' | 'tds';
/**
 * Whether an earning component is part of the PF wage (payroll-compute
 * `pfWageOf`), decided per component:
 *   • `basic` / `da` (dearness allowance) — it is, whatever it is called;
 *   • `none` — it never is, whatever it is called;
 *   • `null` (not set) — its name decides (Basic / Dearness / DA).
 */
export type StatutoryBase = 'basic' | 'da' | 'none';
export interface ISalaryComponent extends Document {
    name: string;
    code: string;
    type: ComponentType;
    calculationType: CalculationType;
    defaultValue: number;
    isTaxable: boolean;
    isStatutory: boolean;
    statutoryType?: StatutoryType;
    statutoryBase: StatutoryBase | null;
    order: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const SalaryComponent: PaginateModel<ISalaryComponent> & Model<ISalaryComponent, {}, {}, {}, Document<unknown, {}, ISalaryComponent, {}, {}> & ISalaryComponent & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=salary-component.model.d.ts.map