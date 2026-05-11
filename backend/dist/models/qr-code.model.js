import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const qrCodeSchema = new Schema({
    code: { type: String, required: true, index: true },
    type: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    locationId: { type: Schema.Types.ObjectId, ref: 'AttendanceSite' },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
});
qrCodeSchema.plugin(timestampPlugin);
qrCodeSchema.plugin(paginatePlugin);
qrCodeSchema.index({ code: 1 }, { unique: true });
export const QRCode = model('QRCode', qrCodeSchema);
//# sourceMappingURL=qr-code.model.js.map