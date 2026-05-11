import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const lineSchema = new Schema({
    componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent' },
    name: { type: String, required: true },
    amount: { type: Number, default: 0 },
}, { _id: false });
const bankSchema = new Schema({
    bankName: String,
    accountNumber: String,
    ifscCode: String,
}, { _id: false });
const payrollRecordSchema = new Schema({
    cycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    earnings: { type: [lineSchema], default: [] },
    deductions: { type: [lineSchema], default: [] },
    employerContributions: { type: [lineSchema], default: [] },
    fullMonthGross: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    daysPaid: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    lopAmount: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    weeklyOffDays: { type: Number, default: 0 },
    unpaidDays: { type: Number, default: 0 },
    lateLoginCount: { type: Number, default: 0 },
    paidLeaveBalance: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    expense: { type: Number, default: 0 },
    advance: { type: Number, default: 0 },
    lateDeduction: { type: Number, default: 0 },
    arrears: { type: Number, default: 0 },
    reimbursements: { type: Number, default: 0 },
    loanDeduction: { type: Number, default: 0 },
    payslipUrl: String,
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paymentRef: String,
    paidAt: Date,
    bankDetails: { type: bankSchema, default: () => ({}) },
});
payrollRecordSchema.plugin(timestampPlugin);
payrollRecordSchema.plugin(softDeletePlugin);
payrollRecordSchema.plugin(paginatePlugin);
payrollRecordSchema.index({ cycleId: 1, employeeId: 1 }, { unique: true });
export const PayrollRecord = model('PayrollRecord', payrollRecordSchema);
//# sourceMappingURL=payroll-record.model.js.map