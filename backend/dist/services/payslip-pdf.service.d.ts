import type { IPayrollLine, IPayrollRecord } from '../models/payroll-record.model.js';
import type { IPayrollCycle } from '../models/payroll-cycle.model.js';
import type { IEmployee } from '../models/employee.model.js';
type PayslipLineSource = Pick<IPayrollRecord, 'earnings' | 'deductions' | 'overtimeAmount' | 'expense' | 'arrears' | 'reimbursements' | 'advance' | 'lateDeduction' | 'loanDeduction' | 'tds'>;
/**
 * The earnings and deduction rows the payslip prints, so that they add up to
 * the record's `grossSalary` / `totalDeductions`.
 *
 * Payroll now keeps every amount as a line (`applyManualAdjustments` in
 * lib/payroll-cycle.ts): over time, expense, arrears, reimbursements,
 * advance, late deduction, loan deduction and TDS each have a line whenever
 * they are non-zero, so a current record prints exactly its line arrays.
 * Records written before that held arrears, reimbursements and loan
 * deduction only as fields (counted in the totals, absent from the lines);
 * any amount without its line gets a row here.
 */
export declare function payslipLines(record: PayslipLineSource): {
    earnings: IPayrollLine[];
    deductions: IPayrollLine[];
};
interface CompanyInfo {
    name: string;
    slug?: string;
    email?: string;
    address?: {
        line1?: string;
        city?: string;
        state?: string;
        zip?: string;
    };
}
export interface YtdTotals {
    earnings: number;
    deductions: number;
    net: number;
}
export declare function inr(amount: number): string;
/** Convert a number to Indian-style English words (whole rupees). */
export declare function numberToIndianWords(n: number): string;
export declare function generatePayslipPdf(record: IPayrollRecord, cycle: IPayrollCycle, employee: IEmployee, tenant: CompanyInfo, ytd: YtdTotals): Promise<string>;
export {};
//# sourceMappingURL=payslip-pdf.service.d.ts.map