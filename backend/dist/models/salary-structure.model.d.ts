import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
import type { CalculationType } from './salary-component.model.js';
export interface IStructureComponent {
    componentId: Types.ObjectId;
    calculationType: CalculationType;
    value: number;
}
export interface ISalaryStructure extends Document {
    name: string;
    components: IStructureComponent[];
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const SalaryStructure: PaginateModel<ISalaryStructure> & Model<ISalaryStructure, {}, {}, {}, Document<unknown, {}, ISalaryStructure, {}, {}> & ISalaryStructure & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=salary-structure.model.d.ts.map