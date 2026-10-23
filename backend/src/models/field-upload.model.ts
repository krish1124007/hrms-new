import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Who uploaded a field file (POST /field/uploads/photo | /document), so a
 * record may reference only its author's own uploads (lib/field-files.ts).
 * Collection `fielduploads`, one document per storage key.
 *
 * Keys issued before this collection existed have no document: the records
 * that already hold them read (and sign) them as before, but they cannot be
 * attached to anything new.
 */
export interface IFieldUpload extends Document {
  /** The storage key, `field-<photos|documents>/YYYY/MM/<ms>-<hex>.<ext>`. */
  key: string;
  kind: 'photo' | 'document';
  /** The user who uploaded it. */
  uploadedBy: Types.ObjectId;
  createdAt: Date;
}

const fieldUploadSchema = new Schema<IFieldUpload>(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: ['photo', 'document'], required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'fielduploads' },
);

// Production builds indexes by hand (migration 20261023000006).
fieldUploadSchema.index({ key: 1 }, { unique: true, name: 'key_1' });

export const FieldUpload = model<IFieldUpload>('FieldUpload', fieldUploadSchema);
