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
}, { _id: false });
const visitSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    purpose: {
        type: String,
        enum: ['sales', 'service', 'collection', 'followup', 'other'],
        default: 'sales',
    },
    checkIn: checkpointSchema,
    checkOut: checkpointSchema,
    duration: Number,
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
export const Visit = model('Visit', visitSchema);
//# sourceMappingURL=visit.model.js.map