import { Schema, model } from 'mongoose';
const legSchema = new Schema({
    fromIndex: { type: Number, required: true },
    toIndex: { type: Number, required: true },
    distanceM: { type: Number, required: true },
    estimated: { type: Boolean, default: false },
}, { _id: false });
const fieldDayRouteSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true },
    signature: { type: String, required: true },
    legs: { type: [legSchema], default: [] },
    totalKm: { type: Number, default: 0 },
    estimated: { type: Boolean, default: false },
    computedAt: { type: Date, default: Date.now },
    retryAfter: { type: Date, default: null },
}, { collection: 'fielddayroutes' });
// Production builds indexes by hand (migration 20261023000005).
fieldDayRouteSchema.index({ employeeId: 1, date: 1 }, { unique: true, name: 'employeeId_1_date_1' });
export const FieldDayRoute = model('FieldDayRoute', fieldDayRouteSchema);
//# sourceMappingURL=field-day-route.model.js.map