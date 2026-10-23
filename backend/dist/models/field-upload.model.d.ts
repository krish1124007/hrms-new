import { type Document, type Types } from 'mongoose';
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
export declare const FieldUpload: import("mongoose").Model<IFieldUpload, {}, {}, {}, Document<unknown, {}, IFieldUpload, {}, {}> & IFieldUpload & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=field-upload.model.d.ts.map