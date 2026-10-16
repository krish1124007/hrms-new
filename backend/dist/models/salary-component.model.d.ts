import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type ComponentType = 'earning' | 'deduction' | 'employer_contribution';
export type CalculationType = 'fixed' | 'percentage_of_basic' | 'percentage_of_gross';
export type StatutoryType = 'pf_employee' | 'pf_employer' | 'esic_employee' | 'esic_employer' | 'professional_tax' | 'tds';
export interface ISalaryComponent extends Document {
    name: string;
    code: string;
    type: ComponentType;
    calculationType: CalculationType;
    defaultValue: number;
    isTaxable: boolean;
    isStatutory: boolean;
    statutoryType?: StatutoryType;
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