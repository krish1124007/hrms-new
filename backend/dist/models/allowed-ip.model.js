import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const allowedIPSchema = new Schema({
    label: { type: String, required: true, trim: true },
    ipAddress: { type: String },
    ipRangeStart: { type: String },
    ipRangeEnd: { type: String },
    locationId: { type: Schema.Types.ObjectId, ref: 'AttendanceSite' },
    isActive: { type: Boolean, default: true },
});
allowedIPSchema.plugin(timestampPlugin);
allowedIPSchema.plugin(softDeletePlugin);
allowedIPSchema.plugin(paginatePlugin);
allowedIPSchema.index({ label: 1 });
allowedIPSchema.index({ ipAddress: 1 });
export const AllowedIP = model('AllowedIP', allowedIPSchema);
//# sourceMappingURL=allowed-ip.model.js.map