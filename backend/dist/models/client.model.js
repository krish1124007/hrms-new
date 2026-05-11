import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const addressSchema = new Schema({
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
}, { _id: false });
const noteSchema = new Schema({
    text: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
}, { _id: false });
const clientSchema = new Schema({
    name: { type: String, required: true, trim: true },
    contactPerson: String,
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    company: String,
    category: { type: String, enum: ['A', 'B', 'C'], default: 'C' },
    tags: { type: [String], default: [] },
    address: addressSchema,
    location: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] }, // [lng, lat]
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
    territory: String,
    lastVisitDate: Date,
    totalOrders: { type: Number, default: 0 },
    totalPayments: { type: Number, default: 0 },
    outstandingAmount: { type: Number, default: 0 },
    notes: { type: [noteSchema], default: [] },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    customFields: { type: Schema.Types.Mixed, default: {} },
});
clientSchema.plugin(timestampPlugin);
clientSchema.plugin(softDeletePlugin);
clientSchema.plugin(paginatePlugin);
clientSchema.index({ name: 1 });
clientSchema.index({ assignedTo: 1 });
clientSchema.index({ category: 1 });
clientSchema.index({ location: '2dsphere' });
export const Client = model('Client', clientSchema);
//# sourceMappingURL=client.model.js.map