import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { timestampPlugin } from '../lib/mongoose-plugins.js';

export interface ISession extends Document {
  userId: Types.ObjectId;
  accessToken: string;
  refreshToken: string;
  device?: string;
  ip?: string;
  userAgent?: string;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>({
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

export const Session = model<ISession, Model<ISession>>('Session', sessionSchema);
