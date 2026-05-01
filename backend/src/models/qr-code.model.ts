import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type QRCodeType = 'static' | 'dynamic';

export interface IQRCode extends Document {
  code: string;
  type: QRCodeType;
  locationId?: Types.ObjectId;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const qrCodeSchema = new Schema<IQRCode>({
  code: { type: String, required: true, index: true },
  type: { type: String, enum: ['static', 'dynamic'], default: 'static' },
  locationId: { type: Schema.Types.ObjectId, ref: 'AttendanceSite' },
  expiresAt: { type: Date },
  isActive: { type: Boolean, default: true },
});
qrCodeSchema.plugin(timestampPlugin);
qrCodeSchema.plugin(paginatePlugin);

qrCodeSchema.index({ code: 1 }, { unique: true });

export const QRCode = model<IQRCode, PaginateModel<IQRCode> & Model<IQRCode>>(
  'QRCode',
  qrCodeSchema,
);
