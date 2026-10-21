import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type VisitPurpose = 'sales' | 'service' | 'collection' | 'followup' | 'delivery' | 'other';
export type VisitOutcome = 'positive' | 'negative' | 'neutral' | 'followup_required';
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export interface IVisitCheckpoint {
    time?: Date;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number;
    };
    photo?: string;
    address?: string;
    /** Check-out only: the rep's notes when closing the visit (the visit's `notes` are the check-in ones). */
    notes?: string;
}
export interface IVisit extends Document {
    employeeId: Types.ObjectId;
    clientId: Types.ObjectId;
    purpose: VisitPurpose;
    checkIn?: IVisitCheckpoint;
    checkOut?: IVisitCheckpoint;
    /** Metres between the check-in fix and the client's pin; unset when either is unknown. */
    distanceFromClientM?: number;
    /** Check-in farther than FIELD_VISIT_RADIUS_M from the client — flagged, never refused. */
    locationMismatch?: boolean;
    /** Checked in without a location fix at a client that has a pin — flagged, never refused. */
    locationMissing?: boolean;
    duration?: number;
    notes?: string;
    outcome?: VisitOutcome;
    nextFollowUpDate?: Date;
    photos: string[];
    meetingWith?: string;
    productsDiscussed: string[];
    orderPlaced?: Types.ObjectId;
    paymentCollected?: Types.ObjectId;
    isPlanned: boolean;
    status: VisitStatus;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Visit: PaginateModel<IVisit> & Model<IVisit, {}, {}, {}, Document<unknown, {}, IVisit, {}, {}> & IVisit & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=visit.model.d.ts.map