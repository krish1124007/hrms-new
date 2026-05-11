import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const assignmentEntrySchema = new Schema({
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    assignedAt: { type: Date, required: true, default: () => new Date() },
    returnedAt: { type: Date, default: null },
    notes: { type: String, trim: true },
}, { _id: true });
const assetSchema = new Schema({
    name: { type: String, required: true, trim: true },
    assetCode: { type: String, required: true, trim: true, uppercase: true },
    category: {
        type: String,
        enum: [
            'laptop',
            'desktop',
            'mobile',
            'tablet',
            'monitor',
            'peripheral',
            'furniture',
            'vehicle',
            'tool',
            'other',
        ],
        default: 'other',
        index: true,
    },
    status: {
        type: String,
        enum: ['available', 'assigned', 'maintenance', 'retired', 'lost'],
        default: 'available',
        index: true,
    },
    condition: {
        type: String,
        enum: ['new', 'good', 'fair', 'poor', 'damaged'],
        default: 'good',
    },
    serialNumber: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    modelNumber: { type: String, trim: true },
    purchaseDate: { type: Date },
    purchasePrice: { type: Number, min: 0 },
    currentValue: { type: Number, min: 0 },
    warrantyExpiresAt: { type: Date },
    location: { type: String, trim: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    assignedAt: { type: Date, default: null },
    history: { type: [assignmentEntrySchema], default: [] },
    notes: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
});
assetSchema.plugin(timestampPlugin);
assetSchema.plugin(softDeletePlugin);
assetSchema.plugin(paginatePlugin);
assetSchema.index({ assetCode: 1 }, { unique: true });
assetSchema.index({ name: 'text', serialNumber: 'text', manufacturer: 'text', modelNumber: 'text' });
export const Asset = model('Asset', assetSchema);
//# sourceMappingURL=asset.model.js.map