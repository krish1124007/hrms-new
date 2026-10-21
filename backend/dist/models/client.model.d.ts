import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type ClientCategory = 'A' | 'B' | 'C';
export type ClientStatus = 'active' | 'inactive';
export interface IClientAddress {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
}
export interface IGeoPoint {
    type: 'Point';
    coordinates: [number, number];
}
export interface IClientNote {
    text: string;
    by?: Types.ObjectId;
    at: Date;
}
export interface IClient extends Document {
    name: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    company?: string;
    category: ClientCategory;
    tags: string[];
    address?: IClientAddress;
    location?: IGeoPoint;
    assignedTo?: Types.ObjectId;
    territory?: string;
    lastVisitDate?: Date;
    /** Ledger figures — recomputed from orders/payments (services/field-ledger.service.ts), never written by clients. */
    totalOrders: number;
    totalOrderValue: number;
    totalPayments: number;
    outstandingAmount: number;
    notes: IClientNote[];
    status: ClientStatus;
    customFields: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Client: PaginateModel<IClient> & Model<IClient, {}, {}, {}, Document<unknown, {}, IClient, {}, {}> & IClient & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=client.model.d.ts.map