import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const idCardFieldSchema = new Schema({
    type: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    style: { type: Schema.Types.Mixed },
}, { _id: false });
const idCardLayoutSchema = new Schema({
    background: { type: String },
    fields: { type: [idCardFieldSchema], default: [] },
}, { _id: false });
const idCardTemplateSchema = new Schema({
    name: { type: String, required: true, trim: true },
    layout: { type: idCardLayoutSchema, default: () => ({}) },
    orientation: {
        type: String,
        enum: ['portrait', 'landscape'],
        default: 'landscape',
    },
    isDefault: { type: Boolean, default: false },
});
idCardTemplateSchema.plugin(timestampPlugin);
idCardTemplateSchema.plugin(softDeletePlugin);
idCardTemplateSchema.plugin(paginatePlugin);
export const IDCardTemplate = model('IDCardTemplate', idCardTemplateSchema);
//# sourceMappingURL=id-card-template.model.js.map