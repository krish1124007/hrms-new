import type { IPayrollRecord } from '../models/payroll-record.model.js';
import type { IPayrollCycle } from '../models/payroll-cycle.model.js';
import type { IEmployee } from '../models/employee.model.js';
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
export declare function generatePayslipPdf(record: IPayrollRecord, cycle: IPayrollCycle, employee: IEmployee, tenant: CompanyInfo, ytd: YtdTotals): Promise<string>;
export {};
//# sourceMappingURL=payslip-pdf.service.d.ts.map