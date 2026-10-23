import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
import { startOfBusinessDay } from '../lib/business-day.js';
export const VISIT_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled', 'missed'];
export const VISIT_REPORT_OUTCOMES = ['completed', 'follow_up', 'not_available', 'other'];
const checkpointSchema = new Schema({
    time: Date,
    location: {
        lat: Number,
        lng: Number,
        accuracy: Number,
    },
    photo: String,
    address: String,
    notes: String,
    distanceM: Number,
    capturedAt: Date,
    receivedAt: Date,
    clientRef: String,
}, { _id: false });
const flagsSchema = new Schema({
    awayFromSite: { type: Boolean, default: false },
    noGps: { type: Boolean, default: false },
    noSelfie: { type: Boolean, default: false },
    shortVisit: { type: Boolean, default: false },
    autoClosed: { type: Boolean, default: false },
    syncedLate: { type: Boolean, default: false },
    capturedOffline: { type: Boolean, default: false },
}, { _id: false });
const reportSchema = new Schema({
    notes: String,
    photos: { type: [String], default: [] },
    documents: { type: [{ key: String, name: String, _id: false }], default: [] },
    peopleMet: { type: [{ name: String, designation: String, phone: String, _id: false }], default: [] },
    outcome: { type: String, enum: VISIT_REPORT_OUTCOMES },
    nextAction: String,
    followUpDate: Date,
    checklist: {
        type: new Schema({
            checklistId: String,
            answers: { type: [{ itemId: String, value: Schema.Types.Mixed, _id: false }], default: [] },
        }, { _id: false }),
        default: undefined,
    },
    submittedAt: Date,
    updatedAt: Date,
}, { _id: false });
const visitSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'FieldSite', required: true },
    purpose: { type: String, trim: true, default: 'Other' },
    status: { type: String, enum: VISIT_STATUSES, default: 'planned' },
    day: Date,
    clientRef: String,
    plannedDate: Date,
    scheduleId: { type: Schema.Types.ObjectId, ref: 'VisitSchedule' },
    plannedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    followUpOf: { type: Schema.Types.ObjectId, ref: 'Visit' },
    notes: String,
    checkIn: checkpointSchema,
    checkOut: checkpointSchema,
    durationMinutes: { type: Number, min: 0 },
    flags: { type: flagsSchema, default: () => ({}) },
    report: reportSchema,
    reportClientRefs: { type: [String], default: [] },
    cancelReason: String,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
visitSchema.plugin(timestampPlugin);
visitSchema.plugin(softDeletePlugin);
visitSchema.plugin(paginatePlugin);
/** The IST business day a visit belongs to: its check-in's, else the planned day. */
export function visitDayOf(v) {
    return startOfBusinessDay(v.checkIn?.time ?? v.plannedDate ?? v.createdAt ?? new Date());
}
// `day` follows the check-in / planned date on every save (the engine's
// conditional updates set it themselves).
visitSchema.pre('validate', function (next) {
    if (!this.day || this.isModified('checkIn.time') || this.isModified('plannedDate')) {
        this.day = visitDayOf(this);
    }
    next();
});
visitSchema.index({ employeeId: 1, day: -1 });
visitSchema.index({ employeeId: 1, createdAt: -1 });
visitSchema.index({ siteId: 1, 'checkIn.time': -1 });
visitSchema.index({ status: 1, plannedDate: 1 });
visitSchema.index({ 'checkIn.time': -1 });
// Offline replays: one visit per (employee, check-in clientRef).
visitSchema.index({ employeeId: 1, clientRef: 1 }, { unique: true, name: 'employee_clientRef_unique', partialFilterExpression: { clientRef: { $type: 'string' } } });
// One open visit per employee per business day: a concurrent second
// check-in fails here. Per day, so an offline replay of an older day can land
// while today's visit is open. Production builds indexes by hand (autoIndex
// is off) — migration 20261023000002.
visitSchema.index({ employeeId: 1, day: 1 }, {
    unique: true,
    name: 'one_open_visit_per_employee_day',
    partialFilterExpression: { status: 'in_progress', isDeleted: false },
});
// A schedule plans each date once.
visitSchema.index({ scheduleId: 1, plannedDate: 1 }, { unique: true, name: 'schedule_date_unique', partialFilterExpression: { scheduleId: { $type: 'objectId' } } });
// One follow-up visit per reported visit.
visitSchema.index({ followUpOf: 1 }, { unique: true, name: 'followUpOf_unique', partialFilterExpression: { followUpOf: { $type: 'objectId' } } });
// A selfie proves one check-in: the visit write that stores it is what marks
// it used (a refused check-in leaves it unused). Migration 20261023000006.
visitSchema.index({ 'checkIn.photo': 1 }, { unique: true, name: 'selfie_single_use', partialFilterExpression: { 'checkIn.photo': { $type: 'string' } } });
export const Visit = model('Visit', visitSchema);
//# sourceMappingURL=visit.model.js.map