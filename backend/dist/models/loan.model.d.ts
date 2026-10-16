import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type LoanType = 'salary_advance' | 'personal_loan' | 'emergency' | 'education' | 'medical' | 'other';
export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'disbursed' | 'active' | 'closed' | 'cancelled';
export type InstallmentStatus = 'scheduled' | 'paid' | 'partial' | 'skipped' | 'overdue';
export interface ILoanInstallment {
    installmentNumber: number;
    dueDate: Date;
    amount: number;
    principalAmount: number;
    interestAmount: number;
    paidAmount: number;
    paidOn?: Date | null;
    status: InstallmentStatus;
    notes?: string;
}
export interface ILoan extends Document {
    loanNumber: string;
    employee: Types.ObjectId;
    type: LoanType;
    principalAmount: number;
    interestRate: number;
    tenureMonths: number;
    emiAmount: number;
    totalPayable: number;
    totalInterest: number;
    status: LoanStatus;
    reason?: string;
    appliedAt: Date;
    approvedBy?: Types.ObjectId | null;
    approvedAt?: Date | null;
    rejectedReason?: string;
    disbursedOn?: Date | null;
    startMonth?: Date | null;
    closedAt?: Date | null;
    installments: ILoanInstallment[];
    outstandingPrincipal: number;
    outstandingTotal: number;
    totalPaid: number;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Loan: PaginateModel<ILoan> & Model<ILoan, {}, {}, {}, Document<unknown, {}, ILoan, {}, {}> & ILoan & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=loan.model.d.ts.map