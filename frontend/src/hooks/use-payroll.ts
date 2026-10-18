import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  payrollApi,
  type SalaryComponentInput,
  type SalaryStructureInput,
  type RecordAdjustmentsInput,
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
/** `enabled: false` for callers that may lack `payroll.process` (the list needs it). */
export function useSalaryStructures(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['payroll-structures'],
    queryFn: () => payrollApi.listStructures(),
    enabled: opts.enabled ?? true,
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
    // A processing run takes seconds: poll until it lands (or goes stale).
    refetchInterval: (query) => (query.state.data?.data.status === 'processing' ? 5000 : false),
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
/** A cycle's status or totals changed: refresh every view of it. */
function invalidateCycle(qc: ReturnType<typeof useQueryClient>, id: string): void {
  qc.invalidateQueries({ queryKey: ['payroll-cycles'] });
  qc.invalidateQueries({ queryKey: ['payroll-cycle', id] });
  qc.invalidateQueries({ queryKey: ['payroll-cycle-records', id] });
}

/**
 * HR adjustments on one record. Errors (409 `ITEM_HELD`, `CYCLE_NOT_EDITABLE`)
 * are toasted by the app-wide mutation handler; the dialog also shows them inline.
 */
export function useUpdateCycleRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cycleId: string; recordId: string; input: RecordAdjustmentsInput }) =>
      payrollApi.updateCycleRecord(vars.cycleId, vars.recordId, vars.input),
    onSuccess: (_d, vars) => {
      // The cycle's totals are the sum of its records.
      invalidateCycle(qc, vars.cycleId);
      toast.success('Adjustments saved');
    },
  });
}
export function useGeneratePayslips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.generatePayslips(id),
    onSuccess: (d, id) => {
      invalidateCycle(qc, id);
      toast.success(`Generated ${d.data.generated} payslip(s)`);
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to generate payslips')),
  });
}
export function useLockCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.lockCycle(id),
    onSuccess: (_d, id) => {
      invalidateCycle(qc, id);
      toast.success('Cycle locked');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to lock cycle')),
  });
}
export function useMarkCyclePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; paymentRef: string; paidAt?: string }) =>
      payrollApi.markCyclePaid(
        vars.id,
        vars.paidAt ? { paymentRef: vars.paymentRef, paidAt: vars.paidAt } : { paymentRef: vars.paymentRef },
      ),
    onSuccess: (d, vars) => {
      invalidateCycle(qc, vars.id);
      // The money has gone out either way; a failed settlement only means the
      // loans / expense claims are not marked paid yet.
      if (d.settlement && !d.settlement.ok) {
        toast.warning(
          'Cycle marked as paid, but settling loans and expense claims failed — use "Retry settlement" on the cycle',
        );
      } else {
        toast.success('Cycle marked as paid');
      }
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to mark as paid')),
  });
}

/** Retry settling a paid cycle's loan instalments and expense claims. */
export function useSettleCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => payrollApi.settleCycle(id),
    onSuccess: (d, id) => {
      invalidateCycle(qc, id);
      const { installmentsPaid = 0, claimsReimbursed = 0 } = d.data ?? {};
      toast.success(
        installmentsPaid + claimsReimbursed === 0
          ? 'Nothing left to settle'
          : `Settled ${installmentsPaid} loan instalment(s) and ${claimsReimbursed} expense claim(s)`,
      );
    },
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
