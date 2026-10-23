import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const addressSchema = new Schema({
    line1: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
}, { _id: false });
const pointSchema = new Schema({
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
}, { _id: false });
const fieldSiteSchema = new Schema({
    clientRef: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    address: { type: addressSchema, default: () => ({}) },
    location: { type: pointSchema, required: false },
    radiusM: { type: Number, required: true, min: 1, default: 200 },
    contactName: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    notes: { type: String },
    photo: { type: String },
    assignedTo: { type: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdVia: { type: String, enum: ['mobile_pin', 'web'], default: 'web' },
    capturedAt: Date,
    lastVisitAt: Date,
    visitCount: { type: Number, default: 0, min: 0 },
}, {
    collection: 'fieldsites',
    toJSON: {
        transform(_doc, ret) {
            const coords = ret.location?.coordinates;
            ret.location = coords && coords.length === 2 ? { lat: coords[1], lng: coords[0] } : null;
            if (ret.photo !== undefined)
                ret.photoUrl = ret.photo;
            delete ret.photo;
            return ret;
        },
    },
});
fieldSiteSchema.plugin(timestampPlugin);
fieldSiteSchema.plugin(softDeletePlugin);
fieldSiteSchema.plugin(paginatePlugin);
// The same names and options migration 20261023000001 builds in production.
fieldSiteSchema.index({ location: '2dsphere' }, { name: 'location_2dsphere' });
fieldSiteSchema.index({ assignedTo: 1 }, { name: 'assignedTo_1' });
fieldSiteSchema.index({ name: 1 }, { name: 'name_1' });
fieldSiteSchema.index({ clientRef: 1 }, { name: 'clientRef_1', unique: true, sparse: true });
export const FieldSite = model('FieldSite', fieldSiteSchema);
//# sourceMappingURL=field-site.model.js.map