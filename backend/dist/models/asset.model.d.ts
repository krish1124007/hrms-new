import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type AssetCategory = 'laptop' | 'desktop' | 'mobile' | 'tablet' | 'monitor' | 'peripheral' | 'furniture' | 'vehicle' | 'tool' | 'other';
export type AssetStatus = 'available' | 'assigned' | 'maintenance' | 'retired' | 'lost';
export type AssetCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged';
export interface IAssetAssignmentEntry {
    employee: Types.ObjectId;
    assignedAt: Date;
    returnedAt?: Date | null;
    notes?: string;
}
export interface IAsset extends Document {
    name: string;
    assetCode: string;
    category: AssetCategory;
    status: AssetStatus;
    condition: AssetCondition;
    serialNumber?: string;
    manufacturer?: string;
    modelNumber?: string;
    purchaseDate?: Date;
    purchasePrice?: number;
    currentValue?: number;
    warrantyExpiresAt?: Date;
    location?: string;
    assignedTo?: Types.ObjectId | null;
    assignedAt?: Date | null;
    history: IAssetAssignmentEntry[];
    notes?: string;
    imageUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Asset: PaginateModel<IAsset> & Model<IAsset, {}, {}, {}, Document<unknown, {}, IAsset, {}, {}> & IAsset & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=asset.model.d.ts.map