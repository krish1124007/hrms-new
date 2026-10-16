import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type QRCodeType = 'static' | 'dynamic';
export interface IQRCode extends Document {
    code: string;
    type: QRCodeType;
    locationId?: Types.ObjectId;
    expiresAt?: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const QRCode: PaginateModel<IQRCode> & Model<IQRCode, {}, {}, {}, Document<unknown, {}, IQRCode, {}, {}> & IQRCode & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=qr-code.model.d.ts.map