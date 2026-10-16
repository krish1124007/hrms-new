import { type Document, type Model, type Types } from 'mongoose';
export interface ISession extends Document {
    userId: Types.ObjectId;
    accessToken: string;
    refreshToken: string;
    device?: string;
    ip?: string;
    userAgent?: string;
    expiresAt: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Session: Model<ISession, {}, {}, {}, Document<unknown, {}, ISession, {}, {}> & ISession & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=session.model.d.ts.map