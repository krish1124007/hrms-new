import { Schema, model } from 'mongoose';
const counterSchema = new Schema({
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
}, { versionKey: false, collection: 'counters' });
export const Counter = model('Counter', counterSchema);
//# sourceMappingURL=counter.model.js.map