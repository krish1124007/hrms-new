import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type ComponentType = 'earning' | 'deduction' | 'employer_contribution';
export type CalculationType = 'fixed' | 'percentage_of_basic' | 'percentage_of_gross';
export type StatutoryType =
  | 'pf_employee'
  | 'pf_employer'
  | 'esic_employee'
  | 'esic_employer'
  | 'professional_tax'
  | 'tds';

export interface SalaryComponent {
  _id: string;
  name: string;
  code: string;
  type: ComponentType;
  calculationType: CalculationType;
  defaultValue: number;
  isTaxable: boolean;
  isStatutory: boolean;
  statutoryType?: StatutoryType;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryComponentInput {
  name: string;
  code: string;
  type: ComponentType;
  calculationType?: CalculationType;
  defaultValue?: number;
  isTaxable?: boolean;
  isStatutory?: boolean;
  statutoryType?: StatutoryType;
  order?: number;
  isActive?: boolean;
}

export interface StructureComponentRef {
  componentId:
    | string
    | {
        _id: string;
        name: string;
        code: string;
        type: ComponentType;
      };
  calculationType: CalculationType;
  value: number;
}

export interface SalaryStructure {
  _id: string;
  name: string;
  components: StructureComponentRef[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryStructureInput {
  name: string;
  components: { componentId: string; calculationType: CalculationType; value: number }[];
  isDefault?: boolean;
  isActive?: boolean;
}

export type PayrollCycleStatus = 'draft' | 'processing' | 'processed' | 'paid' | 'locked';

export interface PayrollCycle {
  _id: string;
  month: number;
  year: number;
  status: PayrollCycleStatus;
  processedAt?: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  payslipGeneratedAt?: string;
  paidAt?: string;
  paymentRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollLine {
  componentId?: string;
  name: string;
  amount: number;
}

export interface PayrollRecord {
  _id: string;
  cycleId:
    | string
    | { _id: string; month: number; year: number; status: PayrollCycleStatus };
  employeeId:
    | string
    | { _id: string; firstName: string; lastName: string; employeeId?: string; email?: string };
  earnings: PayrollLine[];
  deductions: PayrollLine[];
  employerContributions: PayrollLine[];
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lopDays: number;
  lopAmount: number;
  overtimeHours: number;
  overtimeAmount: number;
  arrears: number;
  reimbursements: number;
  loanDeduction: number;
  payslipUrl?: string;
  paymentStatus: 'pending' | 'paid';
  paymentRef?: string;
  paidAt?: string;
  bankDetails: { bankName?: string; accountNumber?: string; ifscCode?: string };
  createdAt: string;
  updatedAt: string;
}

export interface RecordUpdate {
  earnings?: { name: string; amount: number }[];
  deductions?: { name: string; amount: number }[];
  arrears?: number;
  reimbursements?: number;
  loanDeduction?: number;
  overtimeAmount?: number;
  overtimeHours?: number;
}

export interface MonthlyReport {
  cycle: PayrollCycle;
  records: PayrollRecord[];
}

export interface YearlyReport {
  year: number;
  cycles: PayrollCycle[];
  totals: { gross: number; deductions: number; net: number };
}

export interface StatutoryReport {
  filter: { year?: number; month?: number };
  totals: {
    pfEmployee: number;
    pfEmployer: number;
    esicEmployee: number;
    esicEmployer: number;
    professionalTax: number;
  };
  records: PayrollRecord[];
}

export const payrollApi = {
  // components
  listComponents: async (
    params?: Record<string, unknown>,
  ): Promise<ListResponse<SalaryComponent>> =>
    (await api.get('/payroll/components', { params })).data,
  createComponent: async (input: SalaryComponentInput): Promise<ItemResponse<SalaryComponent>> =>
    (await api.post('/payroll/components', input)).data,
  updateComponent: async (
    id: string,
    input: Partial<SalaryComponentInput>,
  ): Promise<ItemResponse<SalaryComponent>> =>
    (await api.patch(`/payroll/components/${id}`, input)).data,
  deleteComponent: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/payroll/components/${id}`)).data,

  // structures
  listStructures: async (): Promise<{ success: boolean; data: SalaryStructure[] }> =>
    (await api.get('/payroll/structures')).data,
  createStructure: async (input: SalaryStructureInput): Promise<ItemResponse<SalaryStructure>> =>
    (await api.post('/payroll/structures', input)).data,
  updateStructure: async (
    id: string,
    input: Partial<SalaryStructureInput>,
  ): Promise<ItemResponse<SalaryStructure>> =>
    (await api.patch(`/payroll/structures/${id}`, input)).data,
  deleteStructure: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/payroll/structures/${id}`)).data,
  assignStructure: async (
    id: string,
    employeeIds: string[],
  ): Promise<{ success: boolean; data: { assigned: number } }> =>
    (await api.post(`/payroll/structures/${id}/assign`, { employeeIds })).data,

  // cycles
  listCycles: async (params?: Record<string, unknown>): Promise<ListResponse<PayrollCycle>> =>
    (await api.get('/payroll/cycles', { params })).data,
  getCycle: async (id: string): Promise<ItemResponse<PayrollCycle>> =>
    (await api.get(`/payroll/cycles/${id}`)).data,
  createCycle: async (input: { month: number; year: number }): Promise<ItemResponse<PayrollCycle>> =>
    (await api.post('/payroll/cycles', input)).data,
  processCycle: async (id: string): Promise<ItemResponse<PayrollCycle>> =>
    (await api.post(`/payroll/cycles/${id}/process`)).data,
  cycleRecords: async (id: string): Promise<{ success: boolean; data: PayrollRecord[] }> =>
    (await api.get(`/payroll/cycles/${id}/records`)).data,
  updateCycleRecord: async (
    cycleId: string,
    recordId: string,
    input: RecordUpdate,
  ): Promise<ItemResponse<PayrollRecord>> =>
    (await api.patch(`/payroll/cycles/${cycleId}/records/${recordId}`, input)).data,
  generatePayslips: async (
    id: string,
  ): Promise<{ success: boolean; data: { generated: number; total: number } }> =>
    (await api.post(`/payroll/cycles/${id}/generate-payslips`)).data,
  lockCycle: async (id: string): Promise<ItemResponse<PayrollCycle>> =>
    (await api.post(`/payroll/cycles/${id}/lock`)).data,
  markCyclePaid: async (
    id: string,
    input: { paymentRef: string; paidAt?: string },
  ): Promise<ItemResponse<PayrollCycle>> =>
    (await api.post(`/payroll/cycles/${id}/mark-paid`, input)).data,

  // records
  getRecord: async (id: string): Promise<ItemResponse<PayrollRecord>> =>
    (await api.get(`/payroll/records/${id}`)).data,
  payslipUrl: async (id: string): Promise<{ success: boolean; data: { url: string } }> =>
    (await api.get(`/payroll/records/${id}/payslip`)).data,

  // self-service
  myPayslips: async (): Promise<{ success: boolean; data: PayrollRecord[] }> =>
    (await api.get('/payroll/my-payslips')).data,

  // reports
  monthlyReport: async (
    year: number,
    month: number,
  ): Promise<{ success: boolean; data: MonthlyReport | null }> =>
    (await api.get('/payroll/reports/monthly', { params: { year, month } })).data,
  yearlyReport: async (year: number): Promise<{ success: boolean; data: YearlyReport }> =>
    (await api.get('/payroll/reports/yearly', { params: { year } })).data,
  statutoryReport: async (params?: {
    year?: number;
    month?: number;
  }): Promise<{ success: boolean; data: StatutoryReport }> =>
    (await api.get('/payroll/reports/statutory', { params })).data,
};
