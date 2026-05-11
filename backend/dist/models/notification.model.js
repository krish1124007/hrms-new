import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const notificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: [
            'leave_request',
            'expense_request',
            'task_assigned',
            'attendance_anomaly',
            'payment_due',
            'system_alert',
            'approval_request',
        ],
        required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: String,
    metadata: Schema.Types.Mixed,
    isRead: { type: Boolean, default: false },
    readAt: Date,
});
notificationSchema.plugin(timestampPlugin);
notificationSchema.plugin(paginatePlugin);
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);
//# sourceMappingURL=notification.model.js.map