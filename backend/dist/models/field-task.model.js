import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const locationSchema = new Schema({
    lat: Number,
    lng: Number,
    address: String,
}, { _id: false });
const fieldTaskSchema = new Schema({
    title: { type: String, required: true, trim: true },
    description: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    location: locationSchema,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
    },
    status: {
        type: String,
        enum: ['new', 'accepted', 'in_progress', 'completed', 'cancelled'],
        default: 'new',
    },
    dueDate: Date,
    completedAt: Date,
    completionPhotos: { type: [String], default: [] },
    completionNotes: String,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
});
fieldTaskSchema.plugin(timestampPlugin);
fieldTaskSchema.plugin(softDeletePlugin);
fieldTaskSchema.plugin(paginatePlugin);
fieldTaskSchema.index({ assignedTo: 1, status: 1 });
fieldTaskSchema.index({ dueDate: 1 });
export const FieldTask = model('FieldTask', fieldTaskSchema);
//# sourceMappingURL=field-task.model.js.map