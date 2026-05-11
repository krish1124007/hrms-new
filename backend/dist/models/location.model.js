import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const locationCoordinatesSchema = new Schema({
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
}, { _id: false });
const locationSchema = new Schema({
    name: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: ['office', 'branch', 'warehouse', 'site'],
        required: true,
    },
    address: { type: String, required: true, trim: true },
    coordinates: { type: locationCoordinatesSchema },
    phone: { type: String, trim: true },
    manager: { type: Schema.Types.ObjectId, ref: 'User' },
    employees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isActive: { type: Boolean, default: true },
});
locationSchema.plugin(timestampPlugin);
locationSchema.plugin(softDeletePlugin);
locationSchema.plugin(paginatePlugin);
locationSchema.index({ type: 1 });
export const Location = model('Location', locationSchema);
//# sourceMappingURL=location.model.js.map