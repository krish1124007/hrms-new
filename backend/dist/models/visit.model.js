import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const checkpointSchema = new Schema({
    time: Date,
    location: {
        lat: Number,
        lng: Number,
        accuracy: Number,
    },
    photo: String,
    address: String,
    notes: String,
}, { _id: false });
const visitSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    purpose: {
        type: String,
        enum: ['sales', 'service', 'collection', 'followup', 'delivery', 'other'],
        default: 'sales',
    },
    checkIn: checkpointSchema,
    checkOut: checkpointSchema,
    distanceFromClientM: Number,
    locationMismatch: { type: Boolean, default: false },
    locationMissing: { type: Boolean, default: false },
    duration: { type: Number, min: 0 },
    notes: String,
    outcome: {
        type: String,
        enum: ['positive', 'negative', 'neutral', 'followup_required'],
    },
    nextFollowUpDate: Date,
    photos: { type: [String], default: [] },
    meetingWith: String,
    productsDiscussed: { type: [String], default: [] },
    orderPlaced: { type: Schema.Types.ObjectId, ref: 'ProductOrder' },
    paymentCollected: { type: Schema.Types.ObjectId, ref: 'PaymentCollection' },
    isPlanned: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
        default: 'scheduled',
    },
});
visitSchema.plugin(timestampPlugin);
visitSchema.plugin(softDeletePlugin);
visitSchema.plugin(paginatePlugin);
visitSchema.index({ employeeId: 1, createdAt: -1 });
visitSchema.index({ clientId: 1, createdAt: -1 });
visitSchema.index({ status: 1 });
visitSchema.index({ 'checkIn.time': -1 });
// One open visit per rep: a concurrent second check-in fails on this index.
// Production builds indexes by hand (autoIndex is off) — see the deploy checklist.
visitSchema.index({ employeeId: 1 }, {
    unique: true,
    name: 'one_open_visit_per_employee',
    partialFilterExpression: { status: 'in_progress', isDeleted: false },
});
export const Visit = model('Visit', visitSchema);
//# sourceMappingURL=visit.model.js.map