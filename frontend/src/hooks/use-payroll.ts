import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  payrollApi,
  type SalaryComponentInput,
  type SalaryStructureInput,
  type RecordUpdate,
} from '@/lib/payroll.api';

const errMsg = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

/* ── Components ── */
export function useSalaryComponents(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['payroll-components', params],
    queryFn: () => payrollApi.listComponents(params),
  });
}
export function useCreateComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SalaryComponentInput) => payrollApi.createComponent(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-components'] });
      toast.success('Component created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create component')),
  });
}
export function useUpdateComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<SalaryComponentInput> }) =>
      payrollApi.updateComponent(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-components'] });
      toast.success('Component updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update component')),
  });
}
export function useDeleteComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.deleteComponent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-components'] });
      toast.success('Component deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete component')),
  });
}

/* ── Structures ── */
export function useSalaryStructures() {
  return useQuery({
    queryKey: ['payroll-structures'],
    queryFn: () => payrollApi.listStructures(),
  });
}
export function useCreateStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SalaryStructureInput) => payrollApi.createStructure(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-structures'] });
      toast.success('Structure created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create structure')),
  });
}
export function useUpdateStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<SalaryStructureInput> }) =>
      payrollApi.updateStructure(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-structures'] });
      toast.success('Structure updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update structure')),
  });
}
export function useDeleteStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.deleteStructure(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-structures'] });
      toast.success('Structure deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete structure')),
  });
}

/* ── Cycles ── */
export function usePayrollCycles(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['payroll-cycles', params],
    queryFn: () => payrollApi.listCycles(params),
  });
}
export function usePayrollCycle(id: string | undefined) {
  return useQuery({
    queryKey: ['payroll-cycle', id],
    queryFn: () => payrollApi.getCycle(id as string),
    enabled: !!id,
  });
}
export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { month: number; year: number }) => payrollApi.createCycle(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-cycles'] });
      toast.success('Cycle created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create cycle')),
  });
}
export function useProcessCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.processCycle(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['payroll-cycles'] });
      qc.invalidateQueries({ queryKey: ['payroll-cycle', id] });
      qc.invalidateQueries({ queryKey: ['payroll-cycle-records', id] });
      toast.success('Payroll processed');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to process payroll')),
  });
}
export function useCycleRecords(cycleId: string | undefined) {
  return useQuery({
    queryKey: ['payroll-cycle-records', cycleId],
    queryFn: () => payrollApi.cycleRecords(cycleId as string),
    enabled: !!cycleId,
  });
}
export function useUpdateCycleRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cycleId: string; recordId: string; input: RecordUpdate }) =>
      payrollApi.updateCycleRecord(vars.cycleId, vars.recordId, vars.input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['payroll-cycle-records', vars.cycleId] });
      toast.success('Record updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update record')),
  });
}
export function useGeneratePayslips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.generatePayslips(id),
    onSuccess: (d, id) => {
      qc.invalidateQueries({ queryKey: ['payroll-cycle', id] });
      qc.invalidateQueries({ queryKey: ['payroll-cycle-records', id] });
      toast.success(`Generated ${d.data.generated} payslip(s)`);
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to generate payslips')),
  });
}
export function useLockCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.lockCycle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-cycles'] });
      toast.success('Cycle locked');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to lock cycle')),
  });
}
export function useMarkCyclePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; paymentRef: string; paidAt?: string }) =>
      payrollApi.markCyclePaid(vars.id, { paymentRef: vars.paymentRef, paidAt: vars.paidAt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-cycles'] });
      toast.success('Cycle marked as paid');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to mark as paid')),
  });
}

/* ── Self-service ── */
export function useMyPayslips() {
  return useQuery({
    queryKey: ['my-payslips'],
    queryFn: () => payrollApi.myPayslips(),
  });
}

/* ── Reports ── */
export function useMonthlyReport(year: number, month: number) {
  return useQuery({
    queryKey: ['payroll-monthly-report', year, month],
    queryFn: () => payrollApi.monthlyReport(year, month),
  });
}
export function useYearlyReport(year: number) {
  return useQuery({
    queryKey: ['payroll-yearly-report', year],
    queryFn: () => payrollApi.yearlyReport(year),
  });
}
export function useStatutoryReport(params?: { year?: number; month?: number }) {
  return useQuery({
    queryKey: ['payroll-statutory-report', params],
    queryFn: () => payrollApi.statutoryReport(params),
  });
}
