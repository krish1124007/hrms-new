import { Schema, model } from 'mongoose';
const fieldUploadSchema = new Schema({
    key: { type: String, required: true },
    kind: { type: String, enum: ['photo', 'document'], required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
}, { collection: 'fielduploads' });
// Production builds indexes by hand (migration 20261023000006).
fieldUploadSchema.index({ key: 1 }, { unique: true, name: 'key_1' });
export const FieldUpload = model('FieldUpload', fieldUploadSchema);
//# sourceMappingURL=field-upload.model.js.map