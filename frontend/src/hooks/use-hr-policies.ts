import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hrPoliciesApi, type PolicyInput } from '@/lib/hr-policies.api';

const errMsg = (err: unknown, fallback: string): string => {
  const e = err as {
    response?: { status?: number; data?: { error?: { message?: string } } };
    code?: string;
  };
  const msg = e.response?.data?.error?.message;
  if (msg) return msg;
  // 413s are usually emitted by the reverse proxy, not the API, so they carry
  // no JSON body — and a request rejected mid-upload surfaces as ERR_NETWORK
  // with no response at all. Both used to collapse into the generic fallback.
  if (e.response?.status === 413) return 'File is too large for the server to accept';
  if (!e.response) return `${fallback} — server unreachable, or the file exceeded the server's upload limit`;
  return fallback;
};

export function usePolicies(params?: Record<string, unknown>) {
  return useQuery({ queryKey: ['policies', params], queryFn: () => hrPoliciesApi.list(params) });
}

export function usePolicy(id: string | undefined) {
  return useQuery({
    queryKey: ['policies', id],
    queryFn: () => hrPoliciesApi.get(id as string),
    enabled: !!id,
  });
}

export function usePolicyStats() {
  return useQuery({ queryKey: ['policies', 'stats'], queryFn: () => hrPoliciesApi.stats() });
}

export function usePolicyAcknowledgements(id: string | undefined) {
  return useQuery({
    queryKey: ['policies', id, 'acknowledgements'],
    queryFn: () => hrPoliciesApi.acknowledgements(id as string),
    enabled: !!id,
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PolicyInput) => hrPoliciesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      toast.success('Policy created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create policy')),
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PolicyInput> }) =>
      hrPoliciesApi.update(id, input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      qc.invalidateQueries({ queryKey: ['policies', v.id] });
      toast.success('Policy updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update policy')),
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrPoliciesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      toast.success('Policy deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete policy')),
  });
}

export function usePublishPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      effectiveDate,
      changeNotes,
    }: {
      id: string;
      effectiveDate?: string | Date;
      changeNotes?: string;
    }) => hrPoliciesApi.publish(id, { effectiveDate, changeNotes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      qc.invalidateQueries({ queryKey: ['policies', v.id] });
      toast.success('Policy published');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to publish')),
  });
}

export function useArchivePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrPoliciesApi.archive(id),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      qc.invalidateQueries({ queryKey: ['policies', v] });
      toast.success('Policy archived');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to archive')),
  });
}

export function useRestorePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrPoliciesApi.restore(id),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      qc.invalidateQueries({ queryKey: ['policies', v] });
      toast.success('Policy restored');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to restore')),
  });
}

export function useAcknowledgePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employee, comment }: { id: string; employee: string; comment?: string }) =>
      hrPoliciesApi.acknowledge(id, { employee, comment }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['policies', v.id] });
      qc.invalidateQueries({ queryKey: ['policies', v.id, 'acknowledgements'] });
      toast.success('Acknowledged');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to acknowledge')),
  });
}

export function useUploadPolicyAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      hrPoliciesApi.uploadAttachment(id, file),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['policies', v.id] });
      toast.success('Attachment uploaded');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to upload attachment')),
  });
}

export function useDeletePolicyAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, attachmentId }: { id: string; attachmentId: string }) =>
      hrPoliciesApi.deleteAttachment(id, attachmentId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['policies', v.id] });
      toast.success('Attachment removed');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to remove attachment')),
  });
}
