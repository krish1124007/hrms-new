import { Schema, model } from 'mongoose';
import { timestampPlugin } from '../lib/mongoose-plugins.js';
const sessionSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true, index: true },
    device: String,
    ip: String,
    userAgent: String,
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
});
sessionSchema.plugin(timestampPlugin);
// TTL index — Mongo deletes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = model('Session', sessionSchema);
//# sourceMappingURL=session.model.js.map