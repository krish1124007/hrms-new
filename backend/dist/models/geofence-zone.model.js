import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const centerSchema = new Schema({
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
}, { _id: false });
const geofenceZoneSchema = new Schema({
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['circle', 'polygon'], required: true },
    center: centerSchema,
    radius: { type: Number },
    coordinates: { type: [centerSchema], default: [] },
    autoCheckIn: { type: Boolean, default: false },
    autoCheckOut: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
});
geofenceZoneSchema.plugin(timestampPlugin);
geofenceZoneSchema.plugin(softDeletePlugin);
geofenceZoneSchema.plugin(paginatePlugin);
geofenceZoneSchema.index({ name: 1 });
export const GeofenceZone = model('GeofenceZone', geofenceZoneSchema);
//# sourceMappingURL=geofence-zone.model.js.map