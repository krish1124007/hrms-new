import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const roleSchema = new Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
});
roleSchema.plugin(timestampPlugin);
roleSchema.plugin(paginatePlugin);
roleSchema.index({ slug: 1 }, { unique: true });
export const Role = model('Role', roleSchema);
export const DEFAULT_ROLES = [
    {
        name: 'Admin',
        slug: 'admin',
        description: 'Full access to all modules and settings',
        permissions: ['*'],
        isSystem: true,
    },
    {
        name: 'HR Manager',
        slug: 'hr_manager',
        description: 'Manages HR — employees, payroll, attendance, leaves',
        permissions: [
            'employees.view',
            'employees.create',
            'employees.update',
            'employees.delete',
            'payroll.view',
            'payroll.process',
            'attendance.view',
            'attendance.manage',
            'leaves.view',
            'leaves.approve',
            'events.manage',
        ],
        isSystem: true,
    },
    {
        name: 'HR Executive',
        slug: 'hr_executive',
        description: 'HR operations without payroll processing',
        permissions: [
            'employees.view',
            'employees.create',
            'employees.update',
            'attendance.view',
            'attendance.manage',
            'leaves.view',
            'events.manage',
        ],
        isSystem: true,
    },
    {
        name: 'Manager',
        slug: 'manager',
        description: 'Team manager — approve leaves, view team data',
        permissions: ['employees.view', 'attendance.view', 'leaves.view', 'leaves.approve'],
        isSystem: true,
    },
    {
        name: 'Employee',
        slug: 'employee',
        description: 'Standard employee — self-service only',
        /**
         * Self-service permissions only. The endpoints these unlock all return
         * the *calling user's* data:
         *   • attendance.checkin → POST /attendance/check-in, /check-out, /breaks/*
         *   • leaves.view        → GET  /leaves/requests/my, /balances (own)
         *   • leaves.create      → POST /leaves/requests (own application)
         *   • expenses.view      → GET  /expense-claims/requests/my
         *   • expenses.create    → POST /expense-claims/requests (own claim)
         *   • expenses.update    → PATCH /expense-claims/requests/:id (own draft)
         *   • expenses.delete    → DELETE own draft claim
         *   • payroll.view       → GET  /payroll/my-payslips
         *   • policies.view      → GET  /hr-policies/published (read-only)
         *   • holidays.view      → GET  /holidays (read-only company calendar)
         */
        permissions: [
            'attendance.checkin',
            'leaves.view',
            'leaves.create',
            'expenses.view',
            'expenses.create',
            'expenses.update',
            'expenses.delete',
            'payroll.view',
            'policies.view',
            'holidays.view',
        ],
        isSystem: true,
    },
];
//# sourceMappingURL=role.model.js.map