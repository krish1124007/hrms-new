import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
/**
 * A place field employees visit (client office, project site, branch, …),
 * pinned on the map with the radius a check-in is expected within.
 *
 * `location` is stored as GeoJSON (`[lng, lat]`, 2dsphere-indexed) and sent
 * out as `{ lat, lng }` (toJSON; `serializeSite` for lean reads). `photo` is
 * the stored `/uploads/<key>` reference, sent out as `photoUrl` (signed on the
 * way out by presignResponse).
 */
export type SiteCreatedVia = 'mobile_pin' | 'web';
export interface ISiteAddress {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
}
export interface IGeoPoint {
    type: 'Point';
    coordinates: [number, number];
}
export interface IFieldSite extends Document {
    /** Idempotency key of the create (mobile pins); unique when present. */
    clientRef?: string;
    name: string;
    /** One of the field settings' `siteTypes` when it was saved. */
    type: string;
    address?: ISiteAddress;
    location?: IGeoPoint;
    /** Metres: a check-in farther than this from the pin is flagged. */
    radiusM: number;
    contactName?: string;
    contactPhone?: string;
    notes?: string;
    photo?: string;
    /** Employees the site is assigned to (the creator, for a pin). */
    assignedTo: Types.ObjectId[];
    /** The User who created it (absent on sites migrated from the old clients). */
    createdBy?: Types.ObjectId;
    createdVia: SiteCreatedVia;
    /** Device time of a pin made offline. */
    capturedAt?: Date;
    lastVisitAt?: Date;
    visitCount: number;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const FieldSite: PaginateModel<IFieldSite> & Model<IFieldSite, {}, {}, {}, Document<unknown, {}, IFieldSite, {}, {}> & IFieldSite & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=field-site.model.d.ts.map