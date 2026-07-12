import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const qrCodeSchema = new Schema({
    code: { type: String, required: true },
    type: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    locationId: { type: Schema.Types.ObjectId, ref: 'AttendanceSite' },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
});
qrCodeSchema.plugin(timestampPlugin);
qrCodeSchema.plugin(paginatePlugin);
qrCodeSchema.index({ code: 1 }, { unique: true });
// TTL: once a code's `expiresAt` passes it is auto-removed. This keeps the
// short-lived dynamic codes (45s window) from piling up. Static codes with no
// `expiresAt` are never touched by the TTL monitor.
qrCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const QRCode = model('QRCode', qrCodeSchema);
//# sourceMappingURL=qr-code.model.js.map